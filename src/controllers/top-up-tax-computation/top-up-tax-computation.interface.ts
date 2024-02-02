export interface InputTopUpTaxComputationSource {
    pi2_top_up_tax_computation_entries: TopUpTaxComputationEntry[];
}

export interface TopUpTaxComputationEntry {
    entity_id: string,
    payroll_costs?: number, // TODO: Separate to another table
    tangible_assets?: number, // TODO: Separate to another table
    additional_TUT?: number,
    domestic_TUT?: number,
    FANIL?: number,
    globe_income_adj_a?: number,
    globe_income_adj_b?: number,
    globe_income_adj_c?: number,
    globe_income_adj_d?: number,
    globe_income_adj_e?: number,
    globe_income_adj_f?: number,
    globe_income_adj_g?: number,
    globe_income_adj_h?: number,
    globe_income_adj_i?: number,
    globe_income_adj_j?: number,
    globe_income_adj_k?: number,
    globe_income_adj_l?: number,
    globe_income_adj_m?: number,
    globe_income_adj_n?: number,
    globe_income_adj_o?: number,
    globe_income_adj_p?: number,
    globe_income_adj_q?: number,
    globe_income_adj_r?: number,
    globe_income_adj_s?: number,
    globe_income_adj_t?: number,
    globe_income_adj_u?: number,
    globe_income_adj_v?: number,
    globe_income_adj_w?: number,
    globe_income_adj_x?: number,
    globe_income_adj_y?: number,
    globe_income_adj_z?: number,
    tax_expense_with_respect_to_covered_taxes?: number,
    covered_taxes_adj_a?: number,
    covered_taxes_adj_b?: number,
    covered_taxes_adj_c?: number,
    covered_taxes_adj_d?: number,
    covered_taxes_adj_e?: number,
    covered_taxes_adj_f?: number,
    covered_taxes_adj_g?: number,
    covered_taxes_adj_h?: number,
    covered_taxes_adj_i?: number,
    covered_taxes_adj_j?: number,
    covered_taxes_adj_k?: number,
    covered_taxes_adj_l?: number,
    covered_taxes_adj_m?: number,
    covered_taxes_adj_n?: number,
    covered_taxes_adj_o?: number,
    covered_taxes_adj_p?: number,
    covered_taxes_adj_q?: number,
    covered_taxes_adj_r?: number
}

export interface TopUpTaxAggregate {
    globe_income_or_loss: number,
    adjusted_covered_tax: number,
    substance_based_income_exclusion: number,
    additional_TUT: number,
    domestic_TUT: number
    etr: number
}

export interface TopUpTaxComputationEntryOutput extends TopUpTaxComputationEntry {
    globe_income_or_loss: number
    adjusted_covered_tax: number
    top_up_tax_generated: number
    etr: number;
}
