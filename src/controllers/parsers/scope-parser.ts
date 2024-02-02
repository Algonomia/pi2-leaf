import {ConsolidationMethod, GroupEntityBaseType, InputScopeSource, SpecialActivity} from "../scope/scope.interface";
import {getValueFromKeyIfTypeCompatible, getValueFromKeyIfTypeCompatibleMandatory} from "../../utils/common";

export function scopeParser(jsonData: {pi2_jurisdiction_elections?: {}[], pi2_group_entity_characteristics: {}[], pi2_ownership_interests: {}[]}): InputScopeSource {
    return {
        pi2_jurisdiction_elections: jsonData.pi2_jurisdiction_elections?.map(entry => {
            return {
                tax_jurisdiction: getValueFromKeyIfTypeCompatibleMandatory<string>('tax_jurisdiction', entry, 'string'),
                "82_safe_harbour_choice": getValueFromKeyIfTypeCompatible<boolean>('82_safe_harbour_choice', entry, 'boolean'),
                exclusion_de_minimis: getValueFromKeyIfTypeCompatible<boolean>('exclusion_de_minimis', entry, 'boolean'),
                is_IIR: getValueFromKeyIfTypeCompatible<boolean>('is_IIR', entry, 'boolean'),
                is_UTPR: getValueFromKeyIfTypeCompatible<boolean>('is_UTPR', entry, 'boolean'),
                fte: getValueFromKeyIfTypeCompatible<number>('fte', entry, 'number'),
                tangible_assets_UTPR: getValueFromKeyIfTypeCompatible<number>('tangible_assets_UTPR', entry, 'number'),
                tangible_assets_TUT: getValueFromKeyIfTypeCompatible<number>('tangible_assets_TUT', entry, 'number'),
                has_last_year_UTPR: getValueFromKeyIfTypeCompatible<boolean>('has_last_year_UTPR', entry, 'boolean')
            }
        }),
        pi2_group_entity_characteristics: jsonData.pi2_group_entity_characteristics.map(entry => {
            return {
                entity_id: getValueFromKeyIfTypeCompatibleMandatory<string>('entity_id', entry, 'string'),
                tax_jurisdiction: getValueFromKeyIfTypeCompatibleMandatory<string>('tax_jurisdiction', entry, 'string'),
                is_group_entity: getValueFromKeyIfTypeCompatibleMandatory<boolean>('is_group_entity', entry, 'boolean'),
                group_entity_name: getValueFromKeyIfTypeCompatible<string>('group_entity_name', entry, 'string'),
                group_entity_base_type: getValueFromKeyIfTypeCompatibleMandatory<GroupEntityBaseType>('group_entity_base_type', entry, GroupEntityBaseType),
                consolidation_method: getValueFromKeyIfTypeCompatibleMandatory<ConsolidationMethod>('consolidation_method', entry, ConsolidationMethod, ConsolidationMethod['Not consolidated']),
                is_main_upe: getValueFromKeyIfTypeCompatible<boolean>('is_main_upe', entry, 'boolean'),
                is_excluded_entity: getValueFromKeyIfTypeCompatible<boolean>('is_excluded_entity', entry, 'boolean'),
                "151_special_activity": getValueFromKeyIfTypeCompatibleMandatory<SpecialActivity>('151_special_activity', entry, SpecialActivity),
                "152ai_criterium": getValueFromKeyIfTypeCompatible<boolean>('152ai_criterium', entry, 'boolean'),
                "152aii_criterium": getValueFromKeyIfTypeCompatible<boolean>('152aii_criterium', entry, 'boolean'),
                "152b_criterium": getValueFromKeyIfTypeCompatible<boolean>('152b_criterium', entry, 'boolean'),
                state_of_election_of_153: getValueFromKeyIfTypeCompatible<boolean>('state_of_election_of_153', entry, 'boolean'),
                ownership_interest_total: getValueFromKeyIfTypeCompatible<number>('ownership_interest_total', entry, 'number'),
                ownership_globe_scope: getValueFromKeyIfTypeCompatible<boolean>('ownership_globe_scope', entry, 'boolean'),
                is_ns_held_for_sale: getValueFromKeyIfTypeCompatible<boolean>('is_ns_held_for_sale', entry, 'boolean'),
            }
        }),
        pi2_ownership_interests: jsonData.pi2_ownership_interests.map(entry => {
            return {
                owner: getValueFromKeyIfTypeCompatibleMandatory<string>('owner', entry, 'string'),
                subsidiary_group_entity: getValueFromKeyIfTypeCompatibleMandatory<string>('subsidiary_group_entity', entry, 'string'),
                ownership_interest_number_of_shares: getValueFromKeyIfTypeCompatible<number>('ownership_interest_number_of_shares', entry, 'number'),
                is_controlling_interest: getValueFromKeyIfTypeCompatible<boolean>('is_controlling_interest', entry, 'boolean'),
                ownership_interest_percent: getValueFromKeyIfTypeCompatible<number>('ownership_interest_percent', entry, 'number'),
                ownership_interest_total: getValueFromKeyIfTypeCompatible<number>('ownership_interest_total', entry, 'number')
            }
        })
    }
}
