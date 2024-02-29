export interface InputScopeSource {
    pi2_group_entity_characteristics: Entity[],
    pi2_ownership_interests: Ownership[],
    pi2_jurisdiction_elections?: Election[]
}

export interface Entity {
    entity_id: string,
    tax_jurisdiction: string,
    is_group_entity: boolean,
    group_entity_name?: string,
    group_entity_base_type: GroupEntityBaseType,
    consolidation_method: ConsolidationMethod,
    is_main_upe?: boolean,
    is_excluded_entity?: boolean,
    "151_special_activity": SpecialActivity,
    "152ai_criterium"?: boolean,
    "152aii_criterium"?: boolean,
    "152b_criterium"?: boolean,
    state_of_election_of_153?: boolean,
    ownership_interest_total?: number,
    ownership_globe_scope?: boolean,
    is_ns_held_for_sale?: boolean
}

export interface Ownership {
    owner: string,
    subsidiary_group_entity: string,
    ownership_interest_number_of_shares?: number,
    is_controlling_interest?: boolean,
    ownership_interest_percent?: number
    ownership_interest_total?: number
}

// TODO : Split Tax jusrisdiction char and elections
export interface Election {
    tax_jurisdiction: string,
    exclusion_de_minimis?: boolean,
    '82_safe_harbour_choice'?: boolean,
    is_IIR?: boolean,
    is_UTPR?: boolean,
    fte?: number,
    tangible_assets_UTPR?: number,
    tangible_assets_TUT?: number,
    has_last_year_UTPR?: boolean,
    safe_harbour_QDMTT?: boolean,
}

export interface SubPerimeter {
    sub_perimeter_id: string,
    sub_perimeter_type: SubPerimeterType,
    perimeter_pe: string,
}

export interface EntityOut extends Entity {
    sub_perimeter_id?: string
    detention_by_upe?: number
    exclusion_reason?: ExclusionReason
    ko_reason?: KOReason[]
}

export interface ElectionOut extends Election {
    utpr?: number
}

export interface OwnershipOut extends Ownership {
    indirect_ownership_percent?: number;
    controlling_interest?: number;
    degree_parentality_min?: number;
    degree_parentality_max?: number;
}

export enum SubPerimeterType {
    'MOMNE'=    'MOMNE',
    'JV'=       'JV',
    'MOCE'=     'MOCE',
    'IVJUR'=    'IVJUR',
    'MAIN'=     'MAIN'
}

export enum SpecialActivity {
    'None'=                                                                 'None',
    'Governmental Entity'=                                                  'Governmental Entity',
    'International Organisation'=                                           'International Organisation',
    'Non-profit Organisation'=                                              'Non-profit Organisation',
    'Pension Fund'=                                                         'Pension Fund',
    'Investment Fund that is an Ultimate Parent Entity'=                    'Investment Fund that is an Ultimate Parent Entity',
    'Real Estate Investment Vehicle that is an Ultimate Parent Entity'=     'a Real Estate Investment Vehicle that is an Ultimate Parent Entity',
}

export enum GroupEntityBaseType {
    'Permanent Establishment'=      'Permanent Establishment',
    'Legal Entity'=                 'Legal Entity',
    'Flow-through/Tax Transparent'= 'Flow-through/Tax Transparent',
    'Investment entity'=            'Investment entity'
}

export enum ConsolidationMethod {
    'Equity'=           'Equity' ,
    'PCON'=             'PCON',
    'FULL'=             'FULL',
    'Not consolidated'= 'Not consolidated'
}

export enum ExclusionReason {
    '1.5.1' =       '1.5.1',
    '1.5.2.(a).i'=  '1.5.2.(a).i',
    '1.5.2.(a).ii'= '1.5.2.(a).ii',
    '1.5.2.(b)'=    '1.5.2.(b)'
}

export enum KOReason {
    'Consolidation method fail' =   'Consolidation method fail',
    'In group but not in UPE' =     'In group but not in UPE',
    'Not really out of group' =     '\'Not really out of group'
}
