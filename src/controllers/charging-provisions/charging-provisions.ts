import {Scope} from "../scope/scope";
import * as math from "mathjs";
import {Matrix, re} from "mathjs";
import {
    ConsolidationMethod,
    Election, ElectionOut,
    Entity,
    ExclusionReason,
    GroupEntityBaseType, OwnershipOut,
    SubPerimeter,
    SubPerimeterType
} from "../scope/scope.interface";
import {first, lastValueFrom, ReplaySubject} from "rxjs";
import {TopUpTaxComputation} from "../top-up-tax-computation/top-up-tax-computation";
import {ChargingProvisionsOutput} from "~/controllers/charging-provisions/charging-provisions.interface";

export class ChargingProvisions {

    static percentThresholdPOPE = 20;

    readonly _scope: Scope;
    readonly _tutComputation: TopUpTaxComputation;
    readonly _iirDirectMatrix: Matrix;

    private _iirIndirectMatrix: ReplaySubject<Matrix>;
    private _ipes: ReplaySubject<Entity[]>;
    private _popes: ReplaySubject<Entity[]>;
    private _irMatrix: ReplaySubject<Matrix>;
    private _allocableShareMatrix: ReplaySubject<Matrix>;
    private _offsetMatrix: ReplaySubject<Matrix>;
    private _allocableShareOffsetMatrix: ReplaySubject<Matrix>;
    private _entityUTPR: ReplaySubject<Map<Entity, number>>;
    private _electionUTPR: ReplaySubject<Map<Election, number>>;
    private _cacheEnsNotInGroupExcludedParents: Map<Entity, Entity[]> = new Map<Entity, Entity[]>();

    constructor(scope: Scope, tutComputation: TopUpTaxComputation) {
        this._scope = scope;
        this._tutComputation = tutComputation;
        this._iirDirectMatrix = this._getIIRDirect();
    }

    // IIR Matrix

    private _getIIRDirect(): Matrix {
        const entities: Entity[] = this._scope.entityList;
        const iirDirectMatrix = <Matrix>math.zeros(entities.length, entities.length);
        this._scope.entityElection.forEach((election, entity) => {
            if (election?.is_IIR) {
                iirDirectMatrix.set([entities.indexOf(entity), entities.indexOf(entity)], 1);
            }
        });
        return iirDirectMatrix;
    }

    private async _getIIRIndirect(): Promise<Matrix> {
        if (!this._iirIndirectMatrix) {
            this._iirIndirectMatrix = new ReplaySubject<math.Matrix>(1);
            const entities: Entity[] = this._scope.entityList;
            const controllingInterestMatrix = await this._scope.getControllingInterestMatrix();
            const isParentMatrix = <Matrix>math.zeros(entities.length, entities.length);
            // @ts-ignore
            isParentMatrix.forEach((value, index: [number, number]) => {
                if (controllingInterestMatrix.get(index) > 0) {
                    isParentMatrix.set(index, 1);
                }
            });
            this._iirIndirectMatrix.next(math.multiply(this._iirDirectMatrix, isParentMatrix));
        }
        return <Matrix> await lastValueFrom(this._iirIndirectMatrix.pipe(first()));
    }

    // IPE

    private async _getIPEs(): Promise<Entity[]> {
        if (!this._ipes) {
            this._ipes = new ReplaySubject<Entity[]>(1);
            const entitySubPerimeter = await this._scope.getSubPerimeters();
            const excludedEntities = await this._scope.getExcludedEntities();
            const detentionMatrix = await this._scope.getDetentionMatrix();
            const constituentEntities = this._scope.entityList.filter(entity => entity.is_group_entity &&
                (entity.consolidation_method !== ConsolidationMethod['Not consolidated'] || entity.is_ns_held_for_sale) &&
                !(excludedEntities.get(entity)?.exclusion));
            const entitiesFiltered = this._scope.entityList.filter(entity => this._isIPEEligible(entity, entitySubPerimeter));
            const ipes = entitiesFiltered.filter(entity => constituentEntities.some(constituentEntity =>
                    detentionMatrix.get([this._scope.entityList.indexOf(entity), this._scope.entityList.indexOf(constituentEntity)]) > 0)
            );
            this._ipes.next(ipes);
        }
        return await lastValueFrom(this._ipes.pipe(first()));
    }

    private _isIPEEligible(entity: Entity, entitySubPerimeter: Map<Entity, SubPerimeter>): boolean {
        if (this._scope.mainUPEs.includes(entity)) {
            return false;
        }
        if (entity.group_entity_base_type === GroupEntityBaseType['Permanent Establishment'] ||
            entity.group_entity_base_type === GroupEntityBaseType['Investment entity']) {
            return false;
        }
        if (!entity.is_group_entity) {
            return false;
        }
        if (!entity.is_ns_held_for_sale && entity.consolidation_method === ConsolidationMethod['Not consolidated']) {
            return false;
        }
        if (entitySubPerimeter.get(entity)?.sub_perimeter_type === SubPerimeterType.JV) {
            return false;
        }
        return true;
    }

    // POPE

    private async _getPOPEs(): Promise<Entity[]>  {
        if (!this._popes) {
            this._popes = new ReplaySubject<Entity[]>(1);
            const excludedEntities = await this._scope.getExcludedEntities();
            const ipes = await this._getIPEs();
            const detentionMatrix = await this._scope.getDetentionMatrix();
            const popes = ipes.filter(ipe => {
                const ensNotInGroupExcluded = this._getEnsNotInGroupExcludedParents(ipe, excludedEntities);
                const exclusionPossessions = this._getExclusionPossessions(ensNotInGroupExcluded, detentionMatrix, ipe);
                const totExclusion = ensNotInGroupExcluded.reduce((a, b) =>
                    a + exclusionPossessions.get([this._scope.entityList.indexOf(b), this._scope.entityList.indexOf(ipe)]), 0);
                return totExclusion > (ChargingProvisions.percentThresholdPOPE / 100);
            });
            this._popes.next(popes);
        }
        return await lastValueFrom(this._popes.pipe(first()));
    }

    private _getEnsNotInGroupExcludedParents(entity: Entity,
                                             excludedEntities: Map<Entity, {entity: Entity, exclusion: boolean, rate: number, exclusion_reason?: ExclusionReason}>,
                                             branch: Set<Entity> = new Set<Entity>()): Entity[] {
        if (this._cacheEnsNotInGroupExcludedParents.has(entity)) {
            return <Entity[]>this._cacheEnsNotInGroupExcludedParents.get(entity);
        }
        if (branch.has(entity)) {
            return [];
        }
        branch.add(entity);
        const parents = this._scope.getDirectParentEntities(entity);
        const excludedParents = parents
            .map(parent => (!parent.is_group_entity || excludedEntities.get(parent)?.exclusion) ? parent : this._getEnsNotInGroupExcludedParents(parent, excludedEntities, branch))
            .flat();
        this._cacheEnsNotInGroupExcludedParents.set(entity, [...new Set(excludedParents)]);
        return <Entity[]>this._cacheEnsNotInGroupExcludedParents.get(entity);
    }

    private _getExclusionPossessions(ensNotInGroupExcluded: Entity[], detentionMatrix: Matrix, ipe: Entity): Matrix {
        const exclusionPossessions = <Matrix>math.zeros(this._scope.entityList.length, this._scope.entityList.length);
        // @ts-ignore
        detentionMatrix.forEach((value, index: [number, number]) => {
            const sumIndirectPossessions = ensNotInGroupExcluded.reduce((a, b) => {
                if (b === ipe) {
                    return a;
                }
                return a + detentionMatrix.get([index[0], this._scope.entityList.indexOf(b)]) *
                    detentionMatrix.get([this._scope.entityList.indexOf(b), index[1]]);
            }, 0);
            exclusionPossessions.set(index, detentionMatrix.get(index) - sumIndirectPossessions);
        });
        return exclusionPossessions;
    }

    // Allocable Share

    private async _getInclusionRatio(): Promise<Matrix> {
        if (!this._irMatrix) {
            this._irMatrix = new ReplaySubject<math.Matrix>(1);
            const detentionMatrix = math.clone(await this._scope.getDetentionMatrix());
            detentionMatrix.resize([this._scope.entityList.length, this._scope.entityList.length], 0);
            const irMatrix = <Matrix>math.zeros(this._scope.entityList.length, this._scope.entityList.length);
            // TODO: flow through
            // @ts-ignore
            detentionMatrix.forEach((value, index: [number, number]) => {
                const childIncome = Math.max(0, this._tutComputation.getTUTEntriesForEntity(this._scope.entityList[index[1]])?.globe_income_or_loss ?? 0);
                if (childIncome > 0) {
                    irMatrix.set(index, value);
                }
            });
            this._irMatrix.next(irMatrix);
        }
        return lastValueFrom(this._irMatrix.pipe(first()));
    }

    private async _getAllocableShare(): Promise<Matrix> {
        if (!this._allocableShareMatrix) {
            this._allocableShareMatrix = new ReplaySubject<math.Matrix>(1);
            const diagTUT = <Matrix>math.zeros(this._scope.entityList.length, this._scope.entityList.length);
            const entityTUT = await this._tutComputation.getEntitiesTUTAndETR();
            entityTUT.forEach((tut, entity) => {
                const index = this._scope.entityList.indexOf(entity);
                diagTUT.set([index, index], tut.tut);
            });
            const irMatrix = await this._getInclusionRatio();
            this._allocableShareMatrix.next(math.multiply(irMatrix, diagTUT));
        }
        return lastValueFrom(this._allocableShareMatrix.pipe(first()));
    }

    // IIR exclusion and offset

    private async _getOffsetMatrix(): Promise<Matrix> {
        if (!this._offsetMatrix) {
            this._offsetMatrix = new ReplaySubject<math.Matrix>(1);
            const ipes = await this._getIPEs();
            const popes = await this._getPOPEs();
            const iirIndirectMatrix = await this._getIIRIndirect();
            const detentionMatrix = await this._scope.getDetentionMatrix();
            const offsetMatrix = <Matrix>math.zeros(this._scope.entityList.length, this._scope.entityList.length);
            const notIRUPEs = this._scope.mainUPEs.filter(upe =>
                this._iirDirectMatrix.get([this._scope.entityList.indexOf(upe), this._scope.entityList.indexOf(upe)]) === 0);
            const eligibleIPEs = this._getOffsetEligibleIPEs(ipes, iirIndirectMatrix);
            const eligiblePOPEs = this._getOffsetEligiblePOPEs(popes, detentionMatrix);
            this._scope.entityList.forEach((entity, index) => {
                if (entity.is_group_entity) {
                    if ((this._scope.mainUPEs.includes(entity) && !notIRUPEs.includes(entity))||
                        (ipes.includes(entity) && !eligibleIPEs.includes(entity)) ||
                        (popes.includes(entity) && !eligiblePOPEs.includes(entity))) {
                        offsetMatrix.set([index, index], 1);
                    }
                }
            });
            this._offsetMatrix.next(offsetMatrix);
        }
        return lastValueFrom(this._offsetMatrix.pipe(first()));
    }

    private _getOffsetEligibleIPEs(ipes: Entity[], iirIndirectMatrix: Matrix): Entity[] {
        const mainUPEs = this._scope.mainUPEs;
        const iirDirectMatrix = this._getIIRDirect();
        if (mainUPEs.some(upe => iirDirectMatrix.get([this._scope.entityList.indexOf(upe), this._scope.entityList.indexOf(upe)]) === 1)) {
            return ipes;
        }
        return ipes.filter(ipe => {
            const sumIndirectIIR = this._scope.entityList.reduce((a, b) =>
                a + iirIndirectMatrix.get([this._scope.entityList.indexOf(b), this._scope.entityList.indexOf(ipe)]), 0);
            return sumIndirectIIR > 0;
        });
    }

    private _getOffsetEligiblePOPEs(popes: Entity[], detentionMatrix: Matrix): Entity[] {
        const iirDirectMatrix = this._getIIRDirect();
        return popes.filter(pope =>
            popes.some(otherPOPE =>
                detentionMatrix.get([this._scope.entityList.indexOf(otherPOPE), this._scope.entityList.indexOf(pope)]) === 1 &&
                iirDirectMatrix.get([this._scope.entityList.indexOf(otherPOPE), this._scope.entityList.indexOf(otherPOPE)]) === 1
            )
        );
    }

    // AllShareWithOffset

    private async _getAllShareWithOffset(): Promise<Map<Entity, number>> {
        const ret = new Map<Entity, number>();
        const allocableShareWOffsetMatrix = await this._getAllShareWithOffsetMatrix();
        const uniqueVector = math.transpose(math.ones(this._scope.entityList.length));
        const allocableShareWOffsetVector = math.multiply(allocableShareWOffsetMatrix, uniqueVector);
        allocableShareWOffsetVector.forEach((value, index) => ret.set(this._scope.entityList[index], value));
        return ret;
    }

    private async _getAllShareWithOffsetMatrix(): Promise<Matrix> {
        if (!this._allocableShareOffsetMatrix) {
            this._allocableShareOffsetMatrix = new ReplaySubject<Matrix>(1);
            const identityMatrix = math.identity([this._scope.entityList.length, this._scope.entityList.length]);
            const offsetMatrix = await this._getOffsetMatrix();
            const detentionMatrix = math.clone(await this._scope.getDetentionMatrix());
            detentionMatrix.resize([offsetMatrix.size()[0], offsetMatrix.size()[1]], 0);
            const allocableShareMatrix = await this._getAllocableShare();
            const allocableShareWOffsetMatrix = math.multiply(
                math.multiply(
                    math.subtract(identityMatrix, detentionMatrix),
                    offsetMatrix
                ),
                allocableShareMatrix
            );
            this._allocableShareOffsetMatrix.next(allocableShareWOffsetMatrix);
        }
        return lastValueFrom(this._allocableShareOffsetMatrix.pipe(first()));
    }

    // UTPR

    private async _getUTPRTotal(): Promise<number> {
        return [...(await this._getUTPRForEntities()).values()].reduce((a, b) => a + b, 0);
    }

    private async _getUTPRForEntities(): Promise<Map<Entity, number>> {
        if (!this._entityUTPR) {
            this._entityUTPR = new ReplaySubject<Map<Entity, number>>(1);
            const ret = new Map<Entity, number>();
            const entityTUT = await this._tutComputation.getEntitiesTUTAndETR();
            const allocableShareOffsetMatrix = await this._getAllShareWithOffsetMatrix();
            this._scope.entityList.forEach((entity, index) => {
                const tut = entityTUT.get(entity);
                const sumAllocable = math.sum(math.column(allocableShareOffsetMatrix, index));
                ret.set(entity, Math.max(0, (tut?.tut ?? 0) - sumAllocable));
            });
            this._entityUTPR.next(ret);
        }
        return lastValueFrom(this._entityUTPR.pipe(first()));
    }

    private async _getUTPRForJurisdictions(): Promise<Map<Election, number>> {
        if (!this._electionUTPR) {
            this._electionUTPR = new ReplaySubject<Map<Election, number>>(1);
            const totalUTPR = await this._getUTPRTotal();
            const elections = this._scope.elections;
            const electionUTPRY = this._getElectionsUTPRY(elections);
            const sumFTEUTPR = this._getSumFTEUTPR(elections, electionUTPRY);
            const sumTangibleAssetsUTPR = this._getSumTangibleAssetsUTPR(elections, electionUTPRY);
            const cardinalElectionsUTPR = elections.filter(election => election.is_UTPR && electionUTPRY.get(election) === 1).length;
            this._electionUTPR.next(new Map(elections.map(election => ([election,
                this._getElectionCoefUTPR(election, electionUTPRY.get(election) ?? 0, sumFTEUTPR, sumTangibleAssetsUTPR, cardinalElectionsUTPR) * totalUTPR
            ]))));
        }
        return lastValueFrom(this._electionUTPR.pipe(first()));
    }

    private _getElectionsUTPRY(elections: Election[]): Map<Election, 0|1> {
        if (elections.every(election => !election.has_last_year_UTPR)) {
            return new Map<Election, 0|1>(elections.map(election => ([election, 1])));
        } else {
            return new Map<Election, 0|1>(elections.map(election => ([election, election.has_last_year_UTPR ? 1 : 0])));
        }
    }

    private _getSumFTEUTPR(elections: Election[], utprys: Map<Election, 0|1>): number {
        return elections.reduce((a, b) => {
            return a + ((utprys.get(b) ?? 0) * (b.is_UTPR ? 1 : 0) * (b.fte ?? 0));
        }, 0);
    }

    private _getSumTangibleAssetsUTPR(elections: Election[], utprys: Map<Election, 0|1>): number {
        return elections.reduce((a, b) => {
            return a + ((utprys.get(b) ?? 0) * (b.is_UTPR ? 1 : 0) * (b.tangible_assets_UTPR ?? 0));
        }, 0);
    }

    private _getElectionCoefUTPR(election: Election, utpry: 0|1, sumFTEUTPR: number, sumTangibleAssetsUTPR: number, cardinalElectionsUTPR: number): number {
        if (sumFTEUTPR === 0 && sumTangibleAssetsUTPR === 0) {
            if (cardinalElectionsUTPR === 0) {
                return 0;
            }
            return utpry * (election.is_UTPR ? 1 : 0) / cardinalElectionsUTPR;
        }
        const weight: number = 1 / (((sumFTEUTPR !== 0) ? 1 : 0) + ((sumTangibleAssetsUTPR !== 0) ? 1 : 0));
        let coef = 0;
        if (sumFTEUTPR !== 0) {
            coef += weight * utpry * (election.is_UTPR ? 1 : 0) * (election.fte ?? 0) / sumFTEUTPR;
        }
        if (sumTangibleAssetsUTPR !== 0) {
            coef += weight * utpry * (election.is_UTPR ? 1 : 0) * (election.tangible_assets_UTPR ?? 0) / sumTangibleAssetsUTPR;
        }
        return coef;
    }

    // Out

    public async getChargingProvisionsOut(): Promise<ChargingProvisionsOutput[]> {
        const ipes = await this._getIPEs();
        const popes = await this._getPOPEs();
        const offsetExcluded = await this._getOffsetMatrix();
        const allShare = await this._getAllocableShare();
        const allSharePayable = await this._getAllShareWithOffset();
        const utprContribution = await this._getUTPRForEntities();
        return this._scope.entityList.map((entity, index) => ({
            entity_id: entity.entity_id,
            is_iir_direct: Boolean(this._iirDirectMatrix.get([index, index])),
            is_ipe: Boolean(ipes.includes(entity)),
            is_pope: Boolean(popes.includes(entity)),
            offset_excluded: Boolean(offsetExcluded.get([index, index])),
            allocable_share: allShare.get([index, index]) ?? 0,
            top_up_tax_to_pay: allSharePayable.get(entity) ?? 0,
            utpr_contribution: utprContribution.get(entity) ?? 0
        }));
    }

    public async getElectionsOut(): Promise<ElectionOut[]> {
        const electionUTPR = await this._getUTPRForJurisdictions();
        return this._scope.elections.map((election) => {
            return Object.assign({
                utpr: electionUTPR.get(election)
            }, election)
        });
    }

}
