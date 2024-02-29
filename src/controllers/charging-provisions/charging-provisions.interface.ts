export interface ChargingProvisionsOutput {
    entity_id: string,
    is_iir_direct: boolean,
    is_ipe: boolean,
    is_pope: boolean,
    offset_excluded: boolean,
    allocable_share: number,
    top_up_tax_to_pay: number,
    utpr_contribution: number
}

export interface AllocableSharesOutput {
    owner: string,
    subsidiary_group_entity: string,
    allocable_share: number
}
