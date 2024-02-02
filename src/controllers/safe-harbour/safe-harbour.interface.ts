export interface InputSafeHarbourSource {
    pi2_safe_harbour_entries: SafeHarbourEntry[];
}

export interface SafeHarbourEntry {
    entity_id: string;
    total_revenue?: number;
    PBT?: number;
    simplified_covered_tax?: number;
    payroll_costs?: number;
    tangible_assets?: number;
}

export interface SafeHarbourOut {
    entity_id: string;
    is_NMCE: boolean;
    is_CBCRDeMinimis: boolean;
    is_CBCRTEI: boolean;
    is_CBCRRoutineProfit: boolean;
    is_QDMTT: boolean;
    is_UTPR: boolean;
    prioritized_safe_harbour?: SafeHarbourType;
}

export enum SafeHarbourType {
    'Transitional CbCR de minimis' = 'Transitional CbCR De minimis',
    'Transitional CbCR TEI' = 'Transitional CbCR TEI',
    'Transitional CbCR Routine profit' = 'Transitional CbCR Routine profit',
    'Transitional UTPR' = 'Transitional UTPR',
    'QDMTT' = 'QDMTT'
}
