import {
    InputTopUpTaxComputationSource,
    TopUpTaxAggregate,
    TopUpTaxComputationEntry,
    TopUpTaxComputationEntryOutput
} from "./top-up-tax-computation.interface";
import {Scope} from "../scope/scope";
import {first, lastValueFrom, ReplaySubject} from "rxjs";
import {Entity, SubPerimeter, SubPerimeterType} from "../scope/scope.interface";

export class TopUpTaxComputation {

    static aggregationCarveOut = 0.05;
    static minTaxRate = 0.15;
    static deMinimisIncomeMax = 10000000;
    static deMinimisNetIncomeMax = 1000000;

    readonly _scope: Scope;
    readonly _entityTUTentry: Map<Entity, TopUpTaxComputationEntryOutput>;
    readonly _tutEntries: TopUpTaxComputationEntryOutput[];

    private _tutAggregatesSubject: ReplaySubject<Map<SubPerimeter, Map<string, TopUpTaxAggregate>>>;
    private _deMinimisExcludedSubject: ReplaySubject<Entity[]>;

    constructor(inputJson: InputTopUpTaxComputationSource, scope: Scope) {
        this._scope = scope;
        this._tutEntries = this.setTUTEntriesOutputFromEntries(inputJson.pi2_top_up_tax_computation_entries ?? []);
        this._entityTUTentry = new Map<Entity, TopUpTaxComputationEntryOutput>();
        this._tutEntries.forEach(tutEntry => {
            const entity = this._scope.entityList.find(entity => entity.entity_id === tutEntry.entity_id)
            if (entity) {
                this._entityTUTentry.set(entity, tutEntry);
            }
        })
    }

    public async getTUTOut(): Promise<TopUpTaxComputationEntryOutput[]> {
        const entitiesTUT = await this.getEntitiesTUTAndETR();
        return [...entitiesTUT.entries()].map(([entity, tutEtr]) => {
            return <TopUpTaxComputationEntryOutput> Object.assign({top_up_tax_generated: tutEtr.tut, etr: tutEtr.etr}, this._entityTUTentry.get(entity));
        })
    }

    public getTUTEntriesForEntity(entity: Entity): TopUpTaxComputationEntryOutput|undefined {
        return this._entityTUTentry.get(entity);
    }

    private setTUTEntriesOutputFromEntries(entries: TopUpTaxComputationEntry[]): TopUpTaxComputationEntryOutput[] {
        return entries.map(e => {
            const out = <TopUpTaxComputationEntryOutput>Object.assign({}, e);
            out.globe_income_or_loss = (e.FANIL ?? 0) +
                (e.globe_income_adj_a ?? 0) +
                (e.globe_income_adj_b ?? 0) +
                (e.globe_income_adj_c ?? 0) +
                (e.globe_income_adj_d ?? 0) +
                (e.globe_income_adj_e ?? 0) +
                (e.globe_income_adj_f ?? 0) +
                (e.globe_income_adj_g ?? 0) +
                (e.globe_income_adj_h ?? 0) +
                (e.globe_income_adj_i ?? 0) +
                (e.globe_income_adj_j ?? 0) +
                (e.globe_income_adj_k ?? 0) +
                (e.globe_income_adj_l ?? 0) +
                (e.globe_income_adj_m ?? 0) +
                (e.globe_income_adj_o ?? 0) +
                (e.globe_income_adj_p ?? 0) +
                (e.globe_income_adj_q ?? 0) +
                (e.globe_income_adj_r ?? 0) +
                (e.globe_income_adj_s ?? 0) +
                (e.globe_income_adj_t ?? 0) +
                (e.globe_income_adj_u ?? 0) +
                (e.globe_income_adj_v ?? 0) +
                (e.globe_income_adj_w ?? 0) +
                (e.globe_income_adj_x ?? 0) +
                (e.globe_income_adj_y ?? 0) +
                (e.globe_income_adj_z ?? 0)
            ;
            out.adjusted_covered_tax = (e.tax_expense_with_respect_to_covered_taxes ?? 0) +
                (e.covered_taxes_adj_a ?? 0) +
                (e.covered_taxes_adj_b ?? 0) +
                (e.covered_taxes_adj_c ?? 0) +
                (e.covered_taxes_adj_d ?? 0) +
                (e.covered_taxes_adj_e ?? 0) +
                (e.covered_taxes_adj_f ?? 0) +
                (e.covered_taxes_adj_g ?? 0) +
                (e.covered_taxes_adj_h ?? 0) +
                (e.covered_taxes_adj_i ?? 0) +
                (e.covered_taxes_adj_j ?? 0) +
                (e.covered_taxes_adj_k ?? 0) +
                (e.covered_taxes_adj_l ?? 0) +
                (e.covered_taxes_adj_m ?? 0) +
                (e.covered_taxes_adj_n ?? 0) +
                (e.covered_taxes_adj_o ?? 0) +
                (e.covered_taxes_adj_p ?? 0) +
                (e.covered_taxes_adj_q ?? 0) +
                (e.covered_taxes_adj_r ?? 0)
            ;
            return out;
        })
    }

    private _getTUTEntriesForEntities(entities: Entity[]): (TopUpTaxComputationEntryOutput|undefined)[] {
        return entities.map(entity => this._entityTUTentry.get(entity));
    }

    // AGGREGATES COMPUTATION

    public async getTUTAggregates(): Promise<Map<SubPerimeter, Map<string, TopUpTaxAggregate>>> {
        if (!this._tutAggregatesSubject) {
            this._tutAggregatesSubject = new ReplaySubject<Map<SubPerimeter, Map<string, TopUpTaxAggregate>>>(1);
            const subPerimeterJurisdictionEntities = await this._scope.getSubPerimeterJurisdictionEntities();
            const ret = new Map<SubPerimeter, Map<string, TopUpTaxAggregate>>();
            subPerimeterJurisdictionEntities.forEach((jurisdictionEntities, subPerimeter) => {
                ret.set(subPerimeter, new Map<string, TopUpTaxAggregate>());
                jurisdictionEntities.forEach((entities, jurisdiction) => {
                    const tutEntries = this._getTUTEntriesForEntities(entities);
                    const globe_income_or_loss = this._getNetGlobeIncomeOrLoss(tutEntries),
                          adjusted_covered_tax= this._getAdjustedCoveredTax(tutEntries);
                    ret.get(subPerimeter)?.set(jurisdiction, {
                        globe_income_or_loss: globe_income_or_loss,
                        adjusted_covered_tax: adjusted_covered_tax,
                        additional_TUT: this._getAdditionalTUT(tutEntries),
                        domestic_TUT: this._getDomesticTUT(tutEntries),
                        substance_based_income_exclusion: this._getSubstanceBasedIncomeExclusion(tutEntries),
                        etr: this._getETRForTopUpTaxAggregate(adjusted_covered_tax, globe_income_or_loss)
                    });
                })
            });
            this._tutAggregatesSubject.next(ret);
        }
        return <Map<SubPerimeter, Map<string, TopUpTaxAggregate>>> await lastValueFrom(this._tutAggregatesSubject.pipe(first()));
    }

    private _getNetGlobeIncomeOrLoss(tutEntries: (TopUpTaxComputationEntryOutput|undefined)[]): number {
        return tutEntries.reduce((a, b) => a + (b?.globe_income_or_loss ?? 0), 0)
    }

    private _getAdjustedCoveredTax(tutEntries: (TopUpTaxComputationEntryOutput|undefined)[]): number {
        return tutEntries.reduce((a, b) => a + (b?.adjusted_covered_tax ?? 0), 0)
    }

    private _getAdditionalTUT(tutEntries: (TopUpTaxComputationEntry|undefined)[]): number {
        return tutEntries.reduce((a, b) => a + (b?.additional_TUT ?? 0), 0)
    }

    private _getDomesticTUT(tutEntries: (TopUpTaxComputationEntry|undefined)[]): number {
        return tutEntries.reduce((a, b) => a + (b?.domestic_TUT ?? 0), 0)
    }

    private _getSubstanceBasedIncomeExclusion(tutEntries: (TopUpTaxComputationEntry|undefined)[]): number {
        return tutEntries.reduce((a, tutEntry) => {
            const payRollCarveOut = TopUpTaxComputation.aggregationCarveOut * (tutEntry?.payroll_costs ?? 0);
            const tangibleAssetsCarveOut = TopUpTaxComputation.aggregationCarveOut * (tutEntry?.tangible_assets ?? 0);
            return a + payRollCarveOut + tangibleAssetsCarveOut;
        }, 0);
    }

    // DE MINIMIS application

    public async getDeMinimisExclusions(): Promise<Entity[]> {
        if (!this._deMinimisExcludedSubject) {
            this._deMinimisExcludedSubject = new ReplaySubject<Entity[]>(1);
            const subPerimeterJurisdictionEntities = await this._scope.getSubPerimeterJurisdictionEntities();
            const entitiesList = this._getDeMinimisGroup(subPerimeterJurisdictionEntities);
            const excludedEntities = entitiesList.filter(entities =>
                this._isDeMinimisCompatible(this._getTUTEntriesForEntities(entities))).flat();
            this._deMinimisExcludedSubject.next(excludedEntities);
        }
        return <Entity[]> await lastValueFrom(this._deMinimisExcludedSubject.pipe(first()));
    }

    private _getDeMinimisGroup(subPerimeterJurisdictionEntities: Map<SubPerimeter, Map<string, Entity[]>>): Entity[][] {
        const jurisdictionTypeSubPerimeters = new Map<string, Map<SubPerimeterType, Entity[]>>;
        [...subPerimeterJurisdictionEntities.entries()].forEach(([subPerimeter, jurisdictionEntities]) => {
            [...jurisdictionEntities.entries()].forEach(([jurisdiction, entities]) => {
                if (this._scope.elections.find(jurisdictionElection => jurisdictionElection.tax_jurisdiction === jurisdiction)?.exclusion_de_minimis) {
                    if (!jurisdictionTypeSubPerimeters.has(jurisdiction)) {
                        jurisdictionTypeSubPerimeters.set(jurisdiction, new Map<SubPerimeterType, Entity[]>());
                    }
                    if (subPerimeter.sub_perimeter_type === SubPerimeterType.MAIN ||
                        subPerimeter.sub_perimeter_type === SubPerimeterType.MOCE ||
                        subPerimeter.sub_perimeter_type === SubPerimeterType.MOMNE) {
                        jurisdictionTypeSubPerimeters.get(jurisdiction)?.set(SubPerimeterType.MAIN,
                            jurisdictionTypeSubPerimeters.get(jurisdiction)?.get(SubPerimeterType.MAIN)?.concat(entities) ?? entities.concat([]));
                    } else if (subPerimeter.sub_perimeter_type === SubPerimeterType.JV) {
                        jurisdictionTypeSubPerimeters.get(jurisdiction)?.set(SubPerimeterType.JV,
                            jurisdictionTypeSubPerimeters.get(jurisdiction)?.get(SubPerimeterType.JV)?.concat(entities) ?? entities.concat([]));
                    }
                }
            });
        });
        return [...jurisdictionTypeSubPerimeters.values()].map((typeSubPerimeters) => (
                [...typeSubPerimeters.values()].map((entities) => (<Entity[]>entities))
            )).flat(1);
    }

    private _isDeMinimisCompatible(tutEntries: (TopUpTaxComputationEntryOutput|undefined)[]): boolean {
        return tutEntries.reduce((a, entry) => a + (Math.max(0, entry?.globe_income_or_loss ?? 0)), 0) < TopUpTaxComputation.deMinimisIncomeMax &&
            tutEntries.reduce((a, entry) => a + (entry?.globe_income_or_loss ?? 0), 0) < TopUpTaxComputation.deMinimisNetIncomeMax
    }

    // Top Up Tax Computation

    public async getEntitiesTUTAndETR(): Promise<Map<Entity, { tut: number, etr: number }>> {
        let ret = new Map<Entity, { tut: number, etr: number }>();
        const subPerimeterJurisdictionTUTAggregates = await this.getTUTAggregates();
        const subPerimeterJurisdictionEntities = await this._scope.getSubPerimeterJurisdictionEntities();
        const deMinimisExcluded = await this.getDeMinimisExclusions();
        subPerimeterJurisdictionTUTAggregates.forEach((jurisdictionAggregates, subPerimeter) => {
            jurisdictionAggregates.forEach((tutAggregate, jurisdiction) => {
                const entities = subPerimeterJurisdictionEntities.get(subPerimeter)?.get(jurisdiction);
                if (entities && !entities.every(entity => deMinimisExcluded.includes(entity))) {
                    ret = new Map<Entity, { tut: number, etr: number }>([...ret.entries(), ...this._getTUTForTUTAggregate(tutAggregate, entities).entries()]);
                }
            })
        });
        return ret;
    }

    private _getTUTForTUTAggregate(tutAggregate: TopUpTaxAggregate, entities: Entity[]): Map<Entity, { tut: number, etr: number }> {
        let tut;
        if (tutAggregate.globe_income_or_loss > 0) {
            tut = this._getTUTForNetGlobeIncomePositive(tutAggregate, entities);
        } else {
            tut = this._getTUTForNetGlobeIncomeZero(tutAggregate, entities);
        }
        return new Map([...tut.entries()].map(([entity, tut]) => ([entity, {tut, etr: tutAggregate.etr}])));
    }

    private _getETRForTopUpTaxAggregate(adjusted_covered_tax: number, globe_income_or_loss: number) {
        const yearlyDTAConsumption = Math.min(
            Math.max(0, adjusted_covered_tax),
            Math.min(TopUpTaxComputation.minTaxRate * globe_income_or_loss, 0) // TODO Globe loss DTA
        )
        return (adjusted_covered_tax + yearlyDTAConsumption) / globe_income_or_loss;
    }

    private _getTUTForNetGlobeIncomePositive(tutAggregate: TopUpTaxAggregate, entities: Entity[]): Map<Entity, number> {
        const tutEntries = this._getTUTEntriesForEntities(entities);
        const excessProfit = Math.max(0, tutAggregate.globe_income_or_loss - tutAggregate.substance_based_income_exclusion);
        const subPerimeterJurisdictionTUT = Math.max(
            0,
            Math.max(0, TopUpTaxComputation.minTaxRate - tutAggregate.etr) * excessProfit + tutAggregate.additional_TUT - tutAggregate.domestic_TUT
        );
        const globeIncome = tutEntries.reduce((a, b) => a + Math.max(0, b?.globe_income_or_loss ?? 0), 0);
        return new Map(tutEntries.map((tutEntry, index) => [entities[index], (Math.max(0, tutEntry?.globe_income_or_loss ?? 0)) / globeIncome * subPerimeterJurisdictionTUT]));
    }

    private _getTUTForNetGlobeIncomeZero(tutAggregate: TopUpTaxAggregate, entities: Entity[]): Map<Entity, number> {
        const tutEntries = this._getTUTEntriesForEntities(entities);
        const globeIncome = tutEntries.reduce((a, b) => a + Math.max(0, b?.globe_income_or_loss ?? 0), 0);
        const totalAdditionalTUT = Math.max(
            0,
            - Math.min(0, tutAggregate.adjusted_covered_tax) - TopUpTaxComputation.minTaxRate * tutAggregate.globe_income_or_loss
        );
        const sumAdditionalTUT = tutEntries.reduce((a, tutEntry) => a + (tutEntry?.additional_TUT ?? 0), 0); // TODO : en fonction de la même fonction
        return new Map(tutEntries.map((tutEntry, index) => {
            const additionalTUT = totalAdditionalTUT * (sumAdditionalTUT === 0 ? (1 / entities.length) : ((tutEntry?.additional_TUT ?? 0) / sumAdditionalTUT)) // TODO Allocation key ?
            if (Math.max(0, tutEntry?.globe_income_or_loss ?? 0) > 0) {
                return [entities[index], additionalTUT + (Math.max(0, tutEntry?.globe_income_or_loss ?? 0) / globeIncome * tutAggregate.additional_TUT)];
            } else {
                return [entities[index], additionalTUT]; // TODO past year
            }
        }));
    }

}
