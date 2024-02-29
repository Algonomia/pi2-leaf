import {
    ConsolidationMethod,
    Election,
    Entity,
    EntityOut,
    ExclusionReason,
    InputScopeSource,
    KOReason,
    Ownership, OwnershipOut,
    SpecialActivity,
    SubPerimeter,
    SubPerimeterType
} from "./scope.interface";
import * as math from "mathjs";
import {Matrix} from "mathjs";
import * as fs from "fs";
import {execSync} from "child_process";
import events from "node:events";
import {ElementaryCircuitsDirected} from "../../utils/elementary-circuits-directed";
import {first, lastValueFrom, ReplaySubject} from "rxjs";
import {matrixToOwnershipLikeOut, reverseMapping} from "../../utils/common";

const readline = require('readline');

export class Scope {

    static percentOfShareFor152a = 95;
    static percentOfShareFor152b = 85;

    static momneDetentionLimit = 30;
    static jvDetentionLimit = 50;

    private _entityList: Entity[] = [];
    private _entityListOK: Entity[] = [];
    private readonly _mainUPEs: Entity[] = [];
    readonly _ownershipList: Ownership[] = [];
    readonly _percentNormalized: number = 1;
    private readonly _adjacentMatrix: Matrix;
    readonly _elections: Election[];
    private _entityElection: Map<Entity, Election>;
    private _electionEntity: Map<Election, Entity[]>;
    private _detentionMatrixSubject: ReplaySubject<Matrix>;
    private _controllingInterestMatrixSubject: ReplaySubject<Matrix>;
    private _entityExclusionDefinition: ReplaySubject<Map<Entity, {entity: Entity, exclusion: boolean, rate: number, exclusion_reason?: ExclusionReason}>>;
    private _entitySubPerimetersSubject: ReplaySubject<Map<Entity, SubPerimeter>>;
    private _subPerimeterJurisdictionEntitiesSubject: ReplaySubject<Map<SubPerimeter, Map<string, Entity[]>>>

    private _brokenChains: {entitiesWithNoUPE: Entity[], entitiesInGroupNotInUPE: Entity[], entitiesNotReallyOutOfGroup: Entity[]};
    private _consolidationMethodsFailedEntityList : Entity[];

    constructor(inputJson: InputScopeSource, percentNormalized: boolean = false) {
        try {
            this._percentNormalized = percentNormalized ? 1 : 100;
            this._entityList = inputJson.pi2_group_entity_characteristics;
            this._ownershipList = inputJson.pi2_ownership_interests;
            this._elections = inputJson.pi2_jurisdiction_elections ?? [];
            this._setEntityElection();
            this._mainUPEs = this._getMainUPEs();
            this._brokenChains = this._getBrokenChains();
            this._consolidationMethodsFailedEntityList = this._getConsolidationMethodFail();
            this._adjacentMatrix = this._getAdjacentMatrix();
            this._entityListOK = this._getOKEntities();
        } catch (e) {
            console.error(e);
        }
    }

    get adjacentMatrix(): math.Matrix {
        return this._adjacentMatrix;
    }

    get mainUPEs(): Entity[] {
        return this._mainUPEs.concat();
    }

    get entityList(): Entity[] {
        return this._entityList.concat();
    }

    get entityListOK(): Entity[] {
        return this._entityListOK.concat();
    }

    get elections(): Election[] {
        return this._elections.concat();
    }

    private _setEntityElection() {
        this._entityElection = new Map<Entity, Election>();
        this.entityList.forEach((entity, index) => {
            const election = this.elections.find(election => election.tax_jurisdiction === entity.tax_jurisdiction);
            if (election) {
                this._entityElection.set(entity, election);
            }
        });
        this._electionEntity = reverseMapping(this._entityElection);
    }

    get entityElection() {
        return this._entityElection;
    }

    get electionEntity() {
        return this._electionEntity;
    }

    get brokenChains(): { entitiesWithNoUPE: Entity[]; entitiesInGroupNotInUPE: Entity[]; entitiesNotReallyOutOfGroup: Entity[] } {
        return this._brokenChains;
    }

    get consolidationMethodsFailedEntityList(): Entity[] {
        return this._consolidationMethodsFailedEntityList.concat();
    }

    public getNotParentEntities(): Entity[] {
        return this._entityList.filter(entity => !this._ownershipList.some(ownership => ownership.owner === entity.entity_id));
    }

    public getNotChildEntities(): Entity[] {
        return this._entityList.filter(entity => !this._ownershipList.some(ownership => ownership.subsidiary_group_entity === entity.entity_id));
    }

    public numberOfEntities(): number {
        return this._entityList.length;
    }

    public getSubsidiaryOwnerships(entity: Entity): Ownership[] {
        return this._ownershipList.filter(ownership => ownership.owner === entity.entity_id && ownership.subsidiary_group_entity !== entity.entity_id);
    }

    public getDirectSubsidiaryEntities(entity: Entity): Entity[] {
        return <Entity[]>this.getSubsidiaryOwnerships(entity)
            .map(ownership => this._entityList.find(parent => ownership.subsidiary_group_entity === parent.entity_id))
            .filter(x => x !== undefined);
    }

    public getDirectParentOwnerships(entity: Entity): Ownership[] {
        return this._ownershipList.filter(ownership => ownership.subsidiary_group_entity === entity.entity_id && ownership.owner !== entity.entity_id);
    }

    public getDirectParentEntities(entity: Entity): Entity[] {
        return <Entity[]>this.getDirectParentOwnerships(entity)
            .map(ownership => this._entityList.find(parent => ownership.owner === parent.entity_id))
            .filter(x => x !== undefined);
    }

    public getAllSubsidiaries(entity: Entity, subsidiaries: Set<Entity> = new Set<Entity>()): Set<Entity> {
        const ownershipSubsidiaries = this.getSubsidiaryOwnerships(entity);
        const directSubsidiaries = ownershipSubsidiaries.map(ownership => this._entityList.find(entity => ownership.subsidiary_group_entity === entity.entity_id));
        directSubsidiaries.filter(subsidiary => subsidiary && !subsidiaries.has(subsidiary))
            .forEach(subsidiary => {
                if (subsidiary) {
                    subsidiaries.add(subsidiary);
                    this.getAllSubsidiaries(subsidiary, subsidiaries)
                }
            });
        return subsidiaries;
    }

    public getAllOwners(entity: Entity, owners: Set<Entity> = new Set<Entity>()): Set<Entity> {
        const ownershipOwners = this.getOwnerOwnerships(entity);
        const directOwners = ownershipOwners.map(ownership => this._entityList.find(entity => ownership.owner === entity.entity_id));
        directOwners.filter(owner => owner && !owners.has(owner))
            .forEach(owner => {
                if (owner) {
                    owners.add(owner);
                    this.getAllOwners(owner, owners)
                }
            });
        return owners;
    }

    public getOwnerOwnerships(entity: Entity): Ownership[] {
        return this._ownershipList.filter(ownership => ownership.subsidiary_group_entity === entity.entity_id);
    }

    public getOwnershipPercent(ownership: Ownership): number {
        const subsidiary:Entity|undefined = this._entityList.find(entity => entity.entity_id === ownership.subsidiary_group_entity);
        if (ownership?.ownership_interest_percent) {
            return Number(ownership.ownership_interest_percent) * (100 / this._percentNormalized);
        } else if (ownership?.ownership_interest_number_of_shares && (ownership?.ownership_interest_total || subsidiary?.ownership_interest_total)) {
            // @ts-ignore
            return ((ownership.ownership_interest_number_of_shares ?? 0) / (ownership.ownership_interest_total ?? subsidiary.ownership_interest_total)) * 100;
        } else {
            return 0;
        }
    }

    public getHeadOwners(entity: Entity): Entity[] {
        return [...this.getAllOwners(entity)].filter(entity => !this._ownershipList.some(ownership => ownership.subsidiary_group_entity === entity.entity_id && entity.is_group_entity));
    }

    public getNotGroupEntities(): Entity[] {
        return this._entityList.filter(entity => !entity.is_group_entity);
    }

    private _getMainUPEs(): Entity[] {
        const mainByAttributes: Entity[] = this._entityList.filter(entity => entity.is_main_upe);
        if (mainByAttributes.length !== 0) {
            return mainByAttributes;
        }
        const mainByNoParent = this._entityList.filter(entity => entity.is_group_entity && ![...this.getAllOwners(entity)].some(owner => owner.is_group_entity && owner !== entity));
        if (mainByNoParent.length !== 0) {
            return mainByNoParent;
        }
        throw new Error('No UPE can be found');
    }

    // BROKEN CHAIN

    private _getBrokenChains(): {entitiesWithNoUPE: Entity[], entitiesInGroupNotInUPE: Entity[], entitiesNotReallyOutOfGroup: Entity[]} {
        const allSubsidiaries = new Set<Entity>(...this._mainUPEs.map(upe => this.getAllSubsidiaries(upe)).flat(1));
        const entitiesWithNoUPE = this._entityList.filter(entity => !this._mainUPEs.includes(entity) && !allSubsidiaries.has(entity));
        const entitiesInGroupNotInUPE = entitiesWithNoUPE.filter(entity => entity.is_group_entity);
        const entitiesNotReallyOutOfGroup = [...allSubsidiaries].filter(entity => !entity.is_group_entity);
        return {entitiesWithNoUPE, entitiesInGroupNotInUPE, entitiesNotReallyOutOfGroup};
    }

    // CONSOLIDATION METHOD CHECKS

    private _getConsolidationMethodFail(): Entity[] {
        return this._entityList.filter(entity => {
            const parents = this.getDirectParentOwnerships(entity).map(ownership => this._entityList.find(e => e.entity_id === ownership.owner && e.is_group_entity));
            if (parents.length === 0) {
                return false;
            }
            return parents.some(parent => {
                const childConso = this._getConsolidationValue(entity);
                const parentConso = parent ? this._getConsolidationValue(parent) : Infinity;
                return parentConso < childConso;
            });
        })
    }

    private _getConsolidationValue(entity: Entity): number {
        const consolidationValues = {'Equity': 1, 'PCON': 2, 'FULL': 3, 'Not consolidated': 0};
        if (entity.consolidation_method === ConsolidationMethod['Not consolidated'] && entity.is_ns_held_for_sale) {
            return 3;
        }
        return consolidationValues[entity.consolidation_method];
    }

    // FILTER OUT KO Entities

    private _getOKEntities(): Entity[] {
        return this._entityList.filter(entity => this._getEntityKOReasons(entity).length === 0);
    }

    private _getEntityKOReasons(entity: Entity): KOReason[] {
        const koReasons = [];
        if (this.consolidationMethodsFailedEntityList.includes(entity)) {
            koReasons.push(KOReason["Consolidation method fail"]);
        }
        if (this.brokenChains.entitiesInGroupNotInUPE.includes(entity)) {
            koReasons.push(KOReason["In group but not in UPE"]);
        }
        if (this.brokenChains.entitiesNotReallyOutOfGroup.includes(entity)) {
            koReasons.push(KOReason["Not really out of group"]);
        }
        return koReasons;
    }

    // ADJACENT MATRIX

    private _getAdjacentMatrix(): Matrix {
        const adjacentMatrix = this._generateAdjacentMatrix();
        const normalizedMatrix = this._getNormalizedAdjacentMatrix(adjacentMatrix).normalizedMatrix;
        return this._getAdjacentMatrixWithRemovedAutoDetention(normalizedMatrix).correctedMatrix;
    }

    private _generateAdjacentMatrix(): Matrix {
        const adjacentMatrix = <Matrix>math.zeros(this._entityList.length, this._entityList.length);
        this._ownershipList.forEach(ownership => {
            const line = this._entityList.findIndex(entity => entity.entity_id === ownership.owner);
            const col = this._entityList.findIndex(entity => entity.entity_id === ownership.subsidiary_group_entity);
            if (line !== -1 && col !== -1) {
                adjacentMatrix.set([line, col], adjacentMatrix.get([line, col]) + this.getOwnershipPercent(ownership) / 100)
            }
        });
        return adjacentMatrix;
    }

    private _getNormalizedAdjacentMatrix(adjacentMatrix: Matrix): { sumSup1Entities: Set<Entity>; sumInf1Entities: Set<Entity>; normalizedMatrix: Matrix } {
        const normalizedMatrix = <Matrix>math.zeros(adjacentMatrix.size()[0], adjacentMatrix.size()[1]);
        const sumSup1Entities = new Set<Entity>(), sumInf1Entities = new Set<Entity>();
        for (let j = 0; j < adjacentMatrix.size()[1]; j++) {
            const col = <number[]>math.flatten(math.column(adjacentMatrix, j)).toArray();
            const sumCol = col.reduce((a, b) => a + b);
            if (sumCol < 1) {
                normalizedMatrix.resize([adjacentMatrix.size()[0] + 1, adjacentMatrix.size()[1] + 1]);
                normalizedMatrix.set([normalizedMatrix.size()[0] - 1, j], 1 - sumCol);
                sumInf1Entities.add(this._entityList[j]);
            } else if (sumCol > 1) {
                sumSup1Entities.add(this._entityList[j]);
            }
            col.forEach((value: number, index: number) => {
                normalizedMatrix.set([index, j], sumCol > 1 ? value/sumCol : value);
            });
        }
        return {normalizedMatrix, sumSup1Entities, sumInf1Entities};
    }

    private _getAdjacentMatrixWithRemovedAutoDetention(adjacentMatrix: Matrix) {
        const correctedMatrix = math.clone(adjacentMatrix);
        const autoDetentionEntities = new Set<Entity>();
        for (let j = 0; j < correctedMatrix.size()[1]; j++) {
            if (correctedMatrix.get([j, j]) !== 0) {
                correctedMatrix.set([j, j], 0);
                const col = <number[]>math.flatten(math.column(adjacentMatrix, j)).toArray();
                const sumCol = col.reduce((a, b) => a + b);
                col.forEach((value: number, index: number) => {
                    correctedMatrix.set([index, j], sumCol !== 0 ? value/sumCol : value);
                });
                autoDetentionEntities.add(this._entityList[j]);
            }
        }
        return {correctedMatrix, autoDetentionEntities};
    }

    // ALL CYCLES

    public getAllElementaryCycles(): Entity[][] {
        const allCycles = ElementaryCircuitsDirected.getCircuits(this._adjacentMatrix);
        return allCycles.map(cycle => cycle.map(entity => this._entityList[entity]));
    }

    private _getAllLinkedCycles(): Entity[][] {
        const linkedCycles: Entity[][] = [];
        const allCycles = this.getAllElementaryCycles();
        for (const allCycle of allCycles) {
            const matchedCycles: Entity[] = [...allCycle];
            const otherCycle = allCycles.filter(cycle => cycle !== allCycle);
            allCycle.forEach(entity => {
                const matched = otherCycle.filter(cycle => cycle.includes(entity));
                matchedCycles.push(...matched.flat());
                matched.forEach(matchedCycle => allCycles.splice(allCycles.indexOf(matchedCycle), 1));
            });
            linkedCycles.push([... new Set(matchedCycles)]);
        }
        return linkedCycles;
    }

    private _getNotChildCycles(): Entity[][] {
        const allCycles = this._getAllLinkedCycles();
        return allCycles.filter(cycle =>
            cycle.every(entity =>
                this.getDirectParentEntities(entity).every(parent => cycle.includes(parent))
            )
        );
    }

    // DETENTION MATRIX

    public async getDetentionMatrix(): Promise<Matrix> {
        if (!this._detentionMatrixSubject) {
            console.log('Detention computation started!');
            this._detentionMatrixSubject = new ReplaySubject<math.Matrix>(1);
            await this._writeAdjacentMatrix(this._adjacentMatrix);
            execSync("./detentionComputation");
            const detentionMatrix = await this._getDetentionMatrixFromOutputFile();
            this._detentionMatrixSubject.next(detentionMatrix);
            console.log('Detention computed!');
        }
        return <Matrix> await lastValueFrom(this._detentionMatrixSubject.pipe(first()));
    }

    public async getDetentionsByUPE() {
        const detentionMatrix = <number[][]>(await this.getDetentionMatrix()).toArray();
        return this._mainUPEs.map(mainUPE => ({
            mainUPE,
            detention: detentionMatrix[this._entityList.indexOf(mainUPE)]
                .map((detention, idx) => ({entity: this._entityList[idx]?.entity_id, detention}))
            })
        );
    }

    private async _getDetentionMatrixFromOutputFile(): Promise<Matrix> {
        const rl = readline.createInterface({
            input: fs.createReadStream("output.csv"),
            crlfDelay: Infinity
        });

        let detentionMatrix: Matrix;
        let i = 0;
        rl.on('line', (line: string) => {
            if (!detentionMatrix) {
                detentionMatrix = <Matrix>math.zeros(line.split(',').length)
            }
            line.split(',').forEach((val, j) => {
                detentionMatrix.set([i, j], Number(val));
            });
            i++;
        });

        await events.once(rl, 'close');

        // @ts-ignore
        return detentionMatrix;
    }

    private async _writeAdjacentMatrix(adjacentMatrix: Matrix) {
        const writeStream = fs.createWriteStream('data.csv');
        for (let i = 0; i < adjacentMatrix.size()[0]; i++) {
            const row = math.row(adjacentMatrix, i);
            writeStream.write((<number[][]>row.toArray())[0]
                .map(val => val === 0 ? 0 : math.format(val, {notation: 'fixed', precision: 14}))
                .join(',') + '\n');
        }
        writeStream.close();
        await events.once(writeStream, 'close');
    }

    // DEGREE PARENTALITY MATRIX

    public getDegreeParentalityMatrix(type: 'min'|'max'): Matrix {
        const degreeParentalityMatrix = <Matrix>math.multiply(math.ones(this._entityList.length, this._entityList.length), -1);
        const startEntities = [...this.getNotChildEntities(), ...this._getNotChildCycles().map(cycle => cycle[0])];
        this._recursiveDegreeParentality(degreeParentalityMatrix, startEntities.map(e => [e]), type);
        return degreeParentalityMatrix;
    }

    private _recursiveDegreeParentality(degreeParentalityMatrix: Matrix, branches: Entity[][], type: 'min'|'max') {
        const nextBranches: Entity[][] = [];
        branches.forEach(branch => {
            const cursor = branch.at(-1);
            if (cursor) {
                const children = this.getDirectSubsidiaryEntities(cursor);
                children.forEach(child => {
                    let toAdd = false;
                    branch.forEach((parent, i) => {
                        if (child === parent) {
                            return;
                        }
                        const level = branch.length - i;
                        const value = degreeParentalityMatrix.get([this._entityList.indexOf(parent), this._entityList.indexOf(child)]);
                        if (value === -1 || (type === 'min' && value > level) || (type === 'max' && value < level)) {
                            const finalBranch = branch.concat([child]).slice(i);
                            if (finalBranch.length === new Set(finalBranch).size) {
                                toAdd = true;
                                degreeParentalityMatrix.set([this._entityList.indexOf(parent), this._entityList.indexOf(child)], level);
                            }
                        }
                    });
                    if (toAdd && branch.filter(p => p === child).length < 2) {
                        nextBranches.push(branch.concat([child]));
                    }
                })
            }
        });
        if (nextBranches.length > 0) {
            this._recursiveDegreeParentality(degreeParentalityMatrix, nextBranches, type);
        }
    }

    // CONTROLLING INTEREST MATRIX

    public async getControllingInterestMatrix(): Promise<Matrix> {
        if (!this._controllingInterestMatrixSubject) {
            this._controllingInterestMatrixSubject = new ReplaySubject<math.Matrix>(1);
            const detentionMatrix = await this.getDetentionMatrix();
            const detentionMatrixSelfOwned = <math.Matrix>math.add(await this.getDetentionMatrix(), math.identity(detentionMatrix.size()));
            const adjacentMatrix = this._adjacentMatrix;
            const controllingInterestMatrix = <Matrix>math.zeros(adjacentMatrix.size()[0], adjacentMatrix.size()[1]);
            const upesIndexes = this._mainUPEs.map(upe => this._entityList.indexOf(upe));
            // @ts-ignore
            controllingInterestMatrix.forEach((value, index: [number, number]) => {
                const directDetention = detentionMatrix.get(index);
                const maxUPEDetention = Math.max(...upesIndexes.map(k =>
                    detentionMatrixSelfOwned.get([k, index[1]]) - detentionMatrixSelfOwned.get([k, index[0]]) * detentionMatrixSelfOwned.get(index)
                ));
                controllingInterestMatrix.set(index, directDetention - maxUPEDetention > 0 ? 1 : 0);
            });
            this._controllingInterestMatrixSubject.next(controllingInterestMatrix);
        }
        return <Matrix> await lastValueFrom(this._controllingInterestMatrixSubject.pipe(first()));
    }
    // TODO : check consistency with UPE

    // EXCLUDED ENTITIES

    public async getExcludedEntities(): Promise<Map<Entity, {entity: Entity, exclusion: boolean, rate: number, exclusion_reason?: ExclusionReason}>> {
        if (!this._entityExclusionDefinition) {
            this._entityExclusionDefinition = new ReplaySubject<Map<Entity, {entity: Entity; exclusion: boolean; rate: number; exclusion_reason?: ExclusionReason}>>(1);
            const detentionMatrix = await this.getDetentionMatrix();
            const entityExclusionMap = this._getExclusion151ForEntity(this.entityList);
            const eligible152Entities = this._getEntities152Eligible();
            const eligible152EntitiesHeadOwners = eligible152Entities.map(entity => this.getHeadOwners(entity)).flat(1);
            this._entityExclusionDefinition.next(this._getExclusion152ForEntity(eligible152EntitiesHeadOwners, detentionMatrix, entityExclusionMap));
        }
        return lastValueFrom(this._entityExclusionDefinition.pipe(first()));
    }

    private _getExclusion151ForEntity(entities: Entity[]) :
        Map<Entity, {entity: Entity, exclusion: boolean; rate: number; exclusion_reason?: ExclusionReason}> {
        const entityExclusionMap = new Map<Entity, {entity: Entity, exclusion: boolean, rate: number, exclusion_reason?: ExclusionReason}>();
        entities.forEach(entity => {
            if (this._isEntity151Excluded(entity)) {
                entityExclusionMap.set(entity, {
                    exclusion: true,
                    rate: 1,
                    entity,
                    exclusion_reason: ExclusionReason["1.5.1"]
                });
                return false;
            }
        });
        return entityExclusionMap;
    }

    // TODO : handle detention cycles
    private _getExclusion152ForEntity(entities: Entity[],
                                   detentionMatrix: Matrix,
                                   entityExclusionMap: Map<Entity, {entity: Entity, exclusion: boolean, rate: number, exclusion_reason?: ExclusionReason}> =
                                       new Map<Entity, {entity: Entity, exclusion: boolean, rate: number, exclusion_reason?: ExclusionReason}>()) :
        Map<Entity, {entity: Entity, exclusion: boolean; rate: number; exclusion_reason?: ExclusionReason}> {
        const remainingEntities = entities.filter(entity => {
            if (entityExclusionMap.has(entity)) {
                return false;
            }
            if (!this._isEntity152Eligible(entity)) {
                entityExclusionMap.set(entity, {exclusion: false, rate: 0, entity});
                return false;
            }
            const directParents = this.getDirectParentEntities(entity);
            if (directParents.every(parent => entityExclusionMap.has(parent))) {
                const sumDirectExclusion = [...entityExclusionMap.values()]
                    .filter(exclusion => directParents.includes(exclusion.entity) && exclusion.exclusion)
                    .map(exclusion => exclusion.rate * detentionMatrix.get([this._entityList.indexOf(exclusion.entity), this._entityList.indexOf(entity)]))
                    .reduce((a, b) => a + b, 0);
                const correctionWithIncludedOwnedByDirectParent = [...entityExclusionMap.values()]
                    .filter(exclusion => directParents.includes(exclusion.entity) && !exclusion.exclusion)
                    .map(exclusion =>
                        directParents.map(parent => (entityExclusionMap.get(parent)?.rate ?? 0) *
                            detentionMatrix.get([this._entityList.indexOf(parent), this._entityList.indexOf(exclusion.entity)]))
                            .reduce((a, b) => a + b, 0)
                    )
                    .reduce((a, b) => a + b, 0);
                const rate = sumDirectExclusion - correctionWithIncludedOwnedByDirectParent;
                const exclusion = this._isEntity152Excluded(entity, rate * 100);
                entityExclusionMap.set(entity, {exclusion: exclusion.exclusion, rate, entity, exclusion_reason: exclusion.exclusion_reason});
                return false;
            }
            return true;
        });
        const childrenEntities = entities
            .filter(entity => !remainingEntities.includes(entity) && !entityExclusionMap.has(entity))
            .map(entity => this.getDirectSubsidiaryEntities(entity)).flat();
        if (remainingEntities.length > 0 || childrenEntities.length > 0) {
            this._getExclusion152ForEntity(remainingEntities.concat(childrenEntities), detentionMatrix, entityExclusionMap);
        }
        return entityExclusionMap;
    }

    private _getEntities152Eligible(): Entity[] {
        return this.entityList.filter(entity => this._isEntity152Eligible(entity));
    }

    private _isEntity152Eligible(entity: Entity): boolean {
        return Boolean(entity["152ai_criterium"] || entity["152aii_criterium"] || entity["152b_criterium"]);
    }

    private _isEntity151Excluded(entity: Entity): boolean {
        return entity["151_special_activity"] !== undefined && entity["151_special_activity"] !== SpecialActivity.None;
    }

    private _isEntity152Excluded(entity: Entity, detention: number): {exclusion: boolean, exclusion_reason?: ExclusionReason} {
        if (entity["152ai_criterium"] === true && this._isEntity152aExcluded(detention)) {
            return {exclusion: true, exclusion_reason: ExclusionReason["1.5.2.(a).i"]}
        }
        if (entity["152aii_criterium"] === true && this._isEntity152aExcluded(detention)) {
            return {exclusion: true, exclusion_reason: ExclusionReason["1.5.2.(a).ii"]}
        }
        if (entity["152b_criterium"] === true && this._isEntity152bExcluded(detention)) {
            return {exclusion: true, exclusion_reason: ExclusionReason["1.5.2.(a).ii"]}
        }
        return {exclusion: false};
    }

    private _isEntity152aExcluded(detention: number): boolean {
        return detention >= Scope.percentOfShareFor152a;
    }

    private _isEntity152bExcluded(detention: number): boolean {
        return detention >= Scope.percentOfShareFor152b;
    }

    // SUB-PERIMETERS

    public async getSubPerimeters(): Promise<Map<Entity, SubPerimeter>> {
        if (!this._entitySubPerimetersSubject) {
            this._entitySubPerimetersSubject = new ReplaySubject<Map<Entity, SubPerimeter>>(1);
            const mainPerimeter: SubPerimeter = {
                sub_perimeter_id: 'MAIN',
                sub_perimeter_type: SubPerimeterType.MAIN,
                perimeter_pe: ''
            }
            const excludedEntities = await this.getExcludedEntities();
            const includedEntities: Entity[] = this._entityList.filter(entity => entity.is_group_entity &&
                (!excludedEntities.has(entity) || !excludedEntities.get(entity)?.exclusion));
            const mapMOMNE = await this._getMOMNE(includedEntities);
            const mapJV = await this._getJV(includedEntities);
            const mapAll = new Map([...mapMOMNE.entries(), ...mapJV.entries()]);
            includedEntities.forEach(includedEntity => {
                if (!mapAll.has(includedEntity) && !this._isNonAffectedJV(includedEntity, mapJV)) {
                    mapAll.set(includedEntity, mainPerimeter);
                }
            });
            const mapIVE = this._getIVESubPerimeters(mapAll);
            mapIVE.forEach((subPerimeter, entity) => mapAll.set(entity, subPerimeter));
            this._entitySubPerimetersSubject.next(mapAll);
        }
        return <Map<Entity, SubPerimeter>> await lastValueFrom(this._entitySubPerimetersSubject.pipe(first()));
    }

    private _isNonAffectedJV(entity: Entity, mapEntitySubPerimeter: Map<Entity, SubPerimeter>): boolean {
        return entity.consolidation_method === ConsolidationMethod.Equity && !mapEntitySubPerimeter.has(entity);
    }

    public async getSubPerimeterJurisdictionEntities(): Promise<Map<SubPerimeter, Map<string, Entity[]>>> {
        if (!this._subPerimeterJurisdictionEntitiesSubject) {
            this._subPerimeterJurisdictionEntitiesSubject = new ReplaySubject<Map<SubPerimeter, Map<string, Entity[]>>>(1);
            const ret = new Map<SubPerimeter, Map<string, Entity[]>>();
            const entitySubPerimeters = await this.getSubPerimeters();
            entitySubPerimeters.forEach((subPerimeter, entity) => {
                if (!ret.has(subPerimeter)) {
                    ret.set(subPerimeter, new Map<string, Entity[]>());
                }
                if (!ret.get(subPerimeter)?.has(entity.tax_jurisdiction)) {
                    ret.get(subPerimeter)?.set(entity.tax_jurisdiction, []);
                }
                ret.get(subPerimeter)?.get(entity.tax_jurisdiction)?.push(entity);
            });
            this._subPerimeterJurisdictionEntitiesSubject.next(ret);
        }
        return <Map<SubPerimeter, Map<string, Entity[]>>> await lastValueFrom(this._subPerimeterJurisdictionEntitiesSubject.pipe(first()));
    }

    private async _getMOMNE(entities: Entity[]): Promise<Map<Entity, SubPerimeter>> {
        const detentionMatrix = await this.getDetentionMatrix();
        const controllingInterestsMatrix = await this.getControllingInterestMatrix();
        const pendingMainMOMNETreatment = entities.filter(entity => this._isMOMNEEligible(entity, this._mainUPEs, detentionMatrix));
        const momneHeads = this._getHeads(pendingMainMOMNETreatment, controllingInterestsMatrix);
        return this._getSubPerimeters(momneHeads, pendingMainMOMNETreatment, controllingInterestsMatrix, this._generateAndAffectSubPerimeterMOMNE);
    }

    private async _getJV(entities: Entity[]): Promise<Map<Entity, SubPerimeter>> {
        const detentionMatrix = await this.getDetentionMatrix();
        const controllingInterestsMatrix = await this.getControllingInterestMatrix();
        const pendingMainJVTreatment = entities.filter(entity => this._isJVEligible(entity, this._mainUPEs, detentionMatrix));
        const jvHeads = this._getHeads(pendingMainJVTreatment, controllingInterestsMatrix);
        return this._getSubPerimeters(jvHeads, pendingMainJVTreatment, controllingInterestsMatrix, this._generateAndAffectSubPerimeterJV);
    }

    private _getSubPerimeters(heads: Entity[], pendingTreatment: Entity[], controllingInterestsMatrix: Matrix, generateAndAffectFunction: (affectedMap: Map<Entity, SubPerimeter>, head: Entity, controlledEntities: Entity[]) => void): Map<Entity, SubPerimeter> {
        const ret = new Map<Entity, SubPerimeter>();
        heads.forEach(head => {
            const headInd = this._entityList.indexOf(head);
            const others = pendingTreatment.filter(otherCandidate => otherCandidate !== head);
            const controlledEntities = others.filter(other => controllingInterestsMatrix.get([headInd, this._entityList.indexOf(other)]) === 1);
            generateAndAffectFunction(ret, head, controlledEntities);
        });
        return ret;
    }

    private _generateAndAffectSubPerimeterMOMNE(affectedMap: Map<Entity, SubPerimeter>, head: Entity, controlledEntities: Entity[]) {
        let subPerimeter: SubPerimeter;
        if (controlledEntities.length > 0) {
            subPerimeter = {sub_perimeter_id: 'MOMNE_' + head.entity_id, sub_perimeter_type: SubPerimeterType.MOMNE, perimeter_pe: head.entity_id};
            controlledEntities.forEach(controlledEntity => affectedMap.set(controlledEntity, subPerimeter));
        } else {
            subPerimeter = {sub_perimeter_id: 'MOCE_' + head.entity_id, sub_perimeter_type: SubPerimeterType.MOCE, perimeter_pe: head.entity_id};
        }
        affectedMap.set(head, subPerimeter);
    }

    private _generateAndAffectSubPerimeterJV(affectedMap: Map<Entity, SubPerimeter>, head: Entity, controlledEntities: Entity[]) {
        const subPerimeter = {sub_perimeter_id: 'JV_' + head.entity_id, sub_perimeter_type: SubPerimeterType.JV, perimeter_pe: head.entity_id};
        controlledEntities.forEach(controlledEntity => affectedMap.set(controlledEntity, subPerimeter));
        affectedMap.set(head, subPerimeter);
    }

    private _isMOMNEEligible(entity: Entity, mainUPEs: Entity[], detentionMatrix: Matrix): boolean {
        if (!mainUPEs.includes(entity) && (entity.consolidation_method === "FULL" || entity.consolidation_method === "PCON")) {
            const entityInd = this._entityList.indexOf(entity);
            const mainUPEsInd = mainUPEs.map(mainUPE => this._entityList.indexOf(mainUPE));
            return mainUPEsInd.every(mainUPEInd => detentionMatrix.get([mainUPEInd, entityInd]) <= (Scope.momneDetentionLimit / 100));
        }
        return false;
    }

    private _getHeads(pendingMainTreatment: Entity[], controllingInterestsMatrix: Matrix): Entity[] {
        return pendingMainTreatment.filter(currentCandidate => {
            const otherCandidates = pendingMainTreatment.filter(otherCandidate => otherCandidate !== currentCandidate);
            const currentCandidateInd = this._entityList.indexOf(currentCandidate);
            const otherCandidatesInd = otherCandidates.map(otherCandidate => this._entityList.indexOf(otherCandidate));
            return otherCandidatesInd.every(otherCandidateInd => controllingInterestsMatrix.get([otherCandidateInd, currentCandidateInd]) === 0);
        });
    }

    private _isJVEligible(entity: Entity, mainUPEs: Entity[], detentionMatrix: Matrix): boolean {
        if (!mainUPEs.includes(entity) && entity.consolidation_method === "Equity") {
            const entityInd = this._entityList.indexOf(entity);
            const mainUPEsInd = mainUPEs.map(mainUPE => this._entityList.indexOf(mainUPE));
            return mainUPEsInd.some(mainUPEInd => detentionMatrix.get([mainUPEInd, entityInd]) >= (Scope.jvDetentionLimit / 100));
        }
        return false;
    }

    private _getIVESubPerimeters(entitySubPerimeterMap: Map<Entity, SubPerimeter>): Map<Entity, SubPerimeter> {
        const ret = new Map<Entity, SubPerimeter>();
        const subPerimeterEntityMap: Map<SubPerimeter, Entity[]> = reverseMapping(entitySubPerimeterMap);
        subPerimeterEntityMap.forEach((entities, subPerimeter) => {
            let subPerimeterIVE: SubPerimeter;
            entities.forEach(entity => {
                if (entity.group_entity_base_type === "Investment entity") {
                    if (!subPerimeterIVE) {
                        subPerimeterIVE = Object.assign({}, subPerimeter);
                        subPerimeterIVE.sub_perimeter_id += '_IVE';
                    }
                    ret.set(entity, subPerimeterIVE);
                }
            });
        });
        return ret;
    }

    // Out

    public async getEntitiesOut(): Promise<EntityOut[]> {
        const entityExclusion = await this.getExcludedEntities();
        const entitySubPerimeter = await this.getSubPerimeters();
        const detentionMatrix = await this.getDetentionMatrix();
        const mainUPEs = this._getMainUPEs();
        return this._entityList.map((entity, index) => {
            const entityOut: EntityOut = Object.assign({
                exclusion_reason: entityExclusion.get(entity)?.exclusion_reason ?? undefined,
                sub_perimeter_id: entitySubPerimeter.get(entity)?.sub_perimeter_id,
                detention_by_upe: mainUPEs.reduce((a, b) => a + detentionMatrix.get([this._entityList.indexOf(b), index]), 0),
                ko_reason: this._getEntityKOReasons(entity)
            }, entity);
            return entityOut;
        });
    }

    public async getOwnershipOut(): Promise<OwnershipOut[]> {
        const ownershipOuts = new Map<string, OwnershipOut>();
        const detentionMatrix = await this.getDetentionMatrix();
        matrixToOwnershipLikeOut<OwnershipOut>(detentionMatrix, 'indirect_ownership_percent', ownershipOuts, this.entityList);
        const controllingInterestsMatrix = await this.getControllingInterestMatrix();
        matrixToOwnershipLikeOut<OwnershipOut>(controllingInterestsMatrix, 'controlling_interest', ownershipOuts, this.entityList);
        const degreeParentalityMatrixMin = this.getDegreeParentalityMatrix('min');
        matrixToOwnershipLikeOut<OwnershipOut>(degreeParentalityMatrixMin, 'degree_parentality_min', ownershipOuts, this.entityList, -1);
        const degreeParentalityMatrixMax = await this.getDegreeParentalityMatrix('max');
        matrixToOwnershipLikeOut<OwnershipOut>(degreeParentalityMatrixMax, 'degree_parentality_max', ownershipOuts, this.entityList, -1);
        return [...ownershipOuts.values()];
    }

}
