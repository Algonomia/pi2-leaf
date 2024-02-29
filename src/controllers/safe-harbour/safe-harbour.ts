import {ConsolidationMethod, Election, Entity, SubPerimeter, SubPerimeterType} from "../scope/scope.interface";
import {Scope} from "../scope/scope";
import {InputSafeHarbourSource, SafeHarbourEntry, SafeHarbourOut, SafeHarbourType} from "./safe-harbour.interface";

export class SafeHarbour {

    private static _CBCRSafeHarbourTotalRevenueThreshold = 10000000;
    private static _CBCRSafeHarbourTPBTThreshold = 1000000;
    private static _CBCRSafeHarbourTEITestThreshold = new Map<number, number>()
        .set(2024, 0.15)
        .set(2025, 0.16)
        .set(2026, 0.17)
    ;
    private static _CBCRSafeHarbourRoutineX1Threshold = new Map<number, number>()
        .set(2024, 0.098)
        .set(2025, 0.096)
        .set(2026, 0.094)
    ;
    private static _CBCRSafeHarbourRoutineX2Threshold = new Map<number, number>()
        .set(2024, 0.078)
        .set(2025, 0.076)
        .set(2026, 0.074)
    ;

    private _safeHarbourEntries: SafeHarbourEntry[];
    private _entitySafeHarbourEntry = new Map<Entity, SafeHarbourEntry>();

    private _NMCEntities: Entity[];
    private _QDMTTSafeHarbour: Entity[];

    private _CBCRDeMinimisSafeHarbour: Map<Entity, number>;
    private _CBCRTEITestSafeHarbour: Map<Entity, number>;
    private _CBCRRoutineProfitTestSafeHarbour: Map<Entity, number>;

    private _UTPRSafeHarbour: Entity[];

    constructor(inputJson: InputSafeHarbourSource, private _scope: Scope, private _year: number) {
        this._safeHarbourEntries = inputJson.pi2_safe_harbour_entries;
        this._safeHarbourEntries?.forEach(safeHarbourEntry => {
            const entity = this._scope.entityList.find(entity => entity.entity_id === safeHarbourEntry.entity_id)
            if (entity) {
                this._entitySafeHarbourEntry.set(entity, safeHarbourEntry);
            }
        })
        this._setNMCE();
        this._setQDMTTSafeHarbour();
        this._setUTPRTest();
    }

    // TODO: change NMCE resolution (for now only conso method check) => later
    private _setNMCE() {
        this._NMCEntities = this._scope.entityList.filter(entity => entity.consolidation_method === ConsolidationMethod["Not consolidated"]);
    }

    private _isNMCE(entity: Entity) {
        return this._NMCEntities.includes(entity);
    }

    // TODO: characteristics SubPerimeter / JV
    private _setQDMTTSafeHarbour(){
        this._QDMTTSafeHarbour = [...this._scope.entityElection.entries()]
            .filter(([_, election]) => election.safe_harbour_QDMTT)
            .map(([entity]) => entity);
    }

    private async _setCBCRSafeHarbour() {
        return Promise.all([
            this._setCBCRDeMinimis(),
            this._setCBCRTEITest(),
            this._setCBCRRoutineProfitTest()
        ]);
    }

    private async _getCBCREntitiesGroup() {
        const groupMap = new Map<SubPerimeter, Map<string, Entity[]>>();
        const addToGroupMap = (subPerimeter: SubPerimeter, jurisdictionEntities: Map<string, Entity[]>) => {
            if (!groupMap.has(subPerimeter)) {
                 groupMap.set(subPerimeter, new Map<string, Entity[]>());
            }
            jurisdictionEntities.forEach((entities, jurisdiction) => {
                const election = this._scope.elections.find(e => e.tax_jurisdiction === jurisdiction);
                if (!(<Map<string, Entity[]>>groupMap.get(subPerimeter)).has(jurisdiction)) {
                    (<Map<string, Entity[]>>groupMap.get(subPerimeter)).set(jurisdiction, []);
                }
                groupMap.get(subPerimeter)?.get(jurisdiction)?.push(...entities)
            });
        }
        const subPerimeterJurisdictionEntities = await this._scope.getSubPerimeterJurisdictionEntities();
        const mainSubperimeter = [...subPerimeterJurisdictionEntities.keys()].find(s => s.sub_perimeter_type === SubPerimeterType.MAIN)
        subPerimeterJurisdictionEntities.forEach((jurisdictionEntities, subPerimeter: SubPerimeter) => {
            if (subPerimeter.sub_perimeter_type === SubPerimeterType.MAIN || subPerimeter.sub_perimeter_type === SubPerimeterType.JV) {
                addToGroupMap(subPerimeter, jurisdictionEntities);
            } else if (mainSubperimeter) {
                addToGroupMap(mainSubperimeter, jurisdictionEntities);
            }
        });
        return [...groupMap.values()].map(val =>
            [...val.entries()].map(([jurisdiction, entities]) => {
                const election = this._scope.elections.find(e => e.tax_jurisdiction === jurisdiction);
                return {entities, election};
            })
        ).flat(1);
    }

    private async _setCBCRDeMinimis() {
        this._CBCRDeMinimisSafeHarbour = new Map<Entity, number>();
        (await this._getCBCREntitiesGroup()).forEach(group => {
            if (true || group.election?.exclusion_de_minimis) {
                const totalRevenueDiff = this._thresholdRelativeDiff(this._totalForKey(group.entities, 'total_revenue'), SafeHarbour._CBCRSafeHarbourTotalRevenueThreshold);
                if (totalRevenueDiff <= 0) {
                    return;
                }
                const PBTDiff = this._thresholdRelativeDiff(this._totalForKey(group.entities, 'PBT'), SafeHarbour._CBCRSafeHarbourTPBTThreshold);
                if (PBTDiff <= 0) {
                    return;
                }
                const relativeDiff = totalRevenueDiff/2 + PBTDiff/2;
                group.entities.forEach(entity => this._CBCRDeMinimisSafeHarbour.set(entity, relativeDiff));
            }
        });
    }

    private async _setCBCRTEITest() {
        this._CBCRTEITestSafeHarbour = new Map<Entity, number>();
        (await this._getCBCREntitiesGroup()).forEach(group => {
            const totalSimplifiedCoveredTax = this._totalForKey(group.entities, 'simplified_covered_tax');
            const totalPBT = this._totalForKey(group.entities, 'PBT');
            if (totalPBT === 0) {
                return;
            }
            if (!SafeHarbour._CBCRSafeHarbourTEITestThreshold.has(this._year)) {
                throw new Error('No TEI test threshold for year: "' + this._year);
            }
            const relativeDiff = this._thresholdRelativeDiff(totalSimplifiedCoveredTax/totalPBT, <number>SafeHarbour._CBCRSafeHarbourTEITestThreshold.get(this._year));
            if (relativeDiff < 0) {
                group.entities.forEach(entity => this._CBCRTEITestSafeHarbour.set(entity, relativeDiff));
            }
        });
    }

    private async _setCBCRRoutineProfitTest() {
        this._CBCRRoutineProfitTestSafeHarbour = new Map<Entity, number>();
        (await this._getCBCREntitiesGroup()).forEach(group => {
            const totalPBT = this._totalForKey(group.entities, 'PBT');
            const totalEligiblePayrollCosts = this._totalForKey(group.entities, 'payroll_costs');
            const totalTangibleAssets = this._totalForKey(group.entities, 'tangible_assets');
            if (!SafeHarbour._CBCRSafeHarbourRoutineX1Threshold.has(this._year)) {
                throw new Error('No RoutineX1 test threshold for year: "' + this._year);
            }
            if (!SafeHarbour._CBCRSafeHarbourRoutineX2Threshold.has(this._year)) {
                throw new Error('No RoutineX2 test threshold for year: "' + this._year);
            }
            const SBIE = <number>SafeHarbour._CBCRSafeHarbourRoutineX1Threshold.get(this._year) * totalEligiblePayrollCosts +
                <number>SafeHarbour._CBCRSafeHarbourRoutineX2Threshold.get(this._year) * totalTangibleAssets;
            const relativeDiff = this._thresholdRelativeDiff(totalPBT, SBIE);
            if (relativeDiff >= 0) {
                group.entities.forEach(entity => this._CBCRRoutineProfitTestSafeHarbour.set(entity, relativeDiff));
            }
        });
    }

    private _thresholdRelativeDiff(value: number, threshold: number): number {
        return (threshold - value) / threshold;
    }

    private _totalForKey(entities: Entity[], key: keyof SafeHarbourEntry): number {
        return entities.reduce((a, b) => {
            const safeHarbourEntry = this._entitySafeHarbourEntry.get(b);
            if (safeHarbourEntry && safeHarbourEntry[key] !== undefined) {
                if (typeof safeHarbourEntry[key] !== 'number') {
                    throw new Error('Wrong type for SafeHarbour computation "' + key + '", should be number');
                }
                return a + <number>safeHarbourEntry[key];
            }
            return a;
        }, 0);
    }

    // TODO: tag UTPR Safe Harbour
    private _setUTPRTest() {
        this._UTPRSafeHarbour = [];
    }

    public async getSafeHarbourOut(): Promise<SafeHarbourOut[]> {
        await this._setCBCRSafeHarbour();
        return this._scope.entityList.map(entity => {
            const safeHarbourOut: SafeHarbourOut = {
                entity_id: entity.entity_id,
                is_NMCE: this._isNMCE(entity),
                is_CBCRDeMinimis: this._CBCRDeMinimisSafeHarbour.has(entity),
                is_CBCRTEI: this._CBCRTEITestSafeHarbour.has(entity),
                is_CBCRRoutineProfit: this._CBCRRoutineProfitTestSafeHarbour.has(entity),
                is_QDMTT: this._QDMTTSafeHarbour.includes(entity),
                is_UTPR: this._UTPRSafeHarbour.includes(entity)
            };
            safeHarbourOut.prioritized_safe_harbour = this._getPrioritizedSafeHarbour(safeHarbourOut, entity);
            return safeHarbourOut;
        })
    }

    private _getPrioritizedSafeHarbour(safeHarbourOut: SafeHarbourOut, entity: Entity) {
        let prioritizedSafeHarbour: SafeHarbourType|undefined = undefined;
        if (safeHarbourOut.is_CBCRDeMinimis || safeHarbourOut.is_CBCRTEI || safeHarbourOut.is_CBCRRoutineProfit) {
            let diffMax = -Infinity;
            [
                {type: SafeHarbourType["Transitional CbCR de minimis"], diff: this._CBCRDeMinimisSafeHarbour.get(entity)},
                {type: SafeHarbourType["Transitional CbCR TEI"], diff: this._CBCRTEITestSafeHarbour.get(entity)},
                {type: SafeHarbourType["Transitional CbCR Routine profit"], diff: this._CBCRRoutineProfitTestSafeHarbour.get(entity)}
            ].forEach((value) => {
                if (value.diff !== undefined && value.diff > diffMax) {
                    prioritizedSafeHarbour = value.type
                    diffMax = value.diff;
                }
            });
        }
        if (!prioritizedSafeHarbour && safeHarbourOut.is_QDMTT) {
            prioritizedSafeHarbour = SafeHarbourType.QDMTT;
        }
        if (!prioritizedSafeHarbour && safeHarbourOut.is_UTPR) {
            prioritizedSafeHarbour = SafeHarbourType["Transitional UTPR"];
        }
        return prioritizedSafeHarbour;
    }

}
