import {InputTopUpTaxComputationSource} from "../top-up-tax-computation/top-up-tax-computation.interface";
import {getValueFromKeyIfTypeCompatible, getValueFromKeyIfTypeCompatibleMandatory} from "../../utils/common";

export function topUpTaxComputationParser(jsonData: {pi2_top_up_tax_computation: {}[]}): InputTopUpTaxComputationSource {
    return {
        pi2_top_up_tax_computation_entries: jsonData.pi2_top_up_tax_computation?.map(entry => {
            return {
                entity_id: getValueFromKeyIfTypeCompatibleMandatory<string>('entity_id', entry, 'string'),
                FANIL: getValueFromKeyIfTypeCompatible<number>('FANIL', entry, 'number'),
                globe_income_adj_a: getValueFromKeyIfTypeCompatible<number>('globe_income_adj_a', entry, 'number'),
                globe_income_adj_b: getValueFromKeyIfTypeCompatible<number>('globe_income_adj_b', entry, 'number'),
                globe_income_adj_c: getValueFromKeyIfTypeCompatible<number>('globe_income_adj_c', entry, 'number'),
                globe_income_adj_d: getValueFromKeyIfTypeCompatible<number>('globe_income_adj_d', entry, 'number'),
                globe_income_adj_e: getValueFromKeyIfTypeCompatible<number>('globe_income_adj_e', entry, 'number'),
                globe_income_adj_f: getValueFromKeyIfTypeCompatible<number>('globe_income_adj_f', entry, 'number'),
                globe_income_adj_g: getValueFromKeyIfTypeCompatible<number>('globe_income_adj_g', entry, 'number'),
                globe_income_adj_h: getValueFromKeyIfTypeCompatible<number>('globe_income_adj_h', entry, 'number'),
                globe_income_adj_i: getValueFromKeyIfTypeCompatible<number>('globe_income_adj_i', entry, 'number'),
                globe_income_adj_j: getValueFromKeyIfTypeCompatible<number>('globe_income_adj_j', entry, 'number'),
                globe_income_adj_k: getValueFromKeyIfTypeCompatible<number>('globe_income_adj_k', entry, 'number'),
                globe_income_adj_l: getValueFromKeyIfTypeCompatible<number>('globe_income_adj_l', entry, 'number'),
                globe_income_adj_m: getValueFromKeyIfTypeCompatible<number>('globe_income_adj_m', entry, 'number'),
                globe_income_adj_n: getValueFromKeyIfTypeCompatible<number>('globe_income_adj_n', entry, 'number'),
                globe_income_adj_o: getValueFromKeyIfTypeCompatible<number>('globe_income_adj_o', entry, 'number'),
                globe_income_adj_p: getValueFromKeyIfTypeCompatible<number>('globe_income_adj_p', entry, 'number'),
                globe_income_adj_q: getValueFromKeyIfTypeCompatible<number>('globe_income_adj_q', entry, 'number'),
                globe_income_adj_r: getValueFromKeyIfTypeCompatible<number>('globe_income_adj_r', entry, 'number'),
                globe_income_adj_s: getValueFromKeyIfTypeCompatible<number>('globe_income_adj_s', entry, 'number'),
                globe_income_adj_t: getValueFromKeyIfTypeCompatible<number>('globe_income_adj_t', entry, 'number'),
                globe_income_adj_u: getValueFromKeyIfTypeCompatible<number>('globe_income_adj_u', entry, 'number'),
                globe_income_adj_v: getValueFromKeyIfTypeCompatible<number>('globe_income_adj_v', entry, 'number'),
                globe_income_adj_w: getValueFromKeyIfTypeCompatible<number>('globe_income_adj_w', entry, 'number'),
                globe_income_adj_x: getValueFromKeyIfTypeCompatible<number>('globe_income_adj_x', entry, 'number'),
                globe_income_adj_y: getValueFromKeyIfTypeCompatible<number>('globe_income_adj_y', entry, 'number'),
                globe_income_adj_z: getValueFromKeyIfTypeCompatible<number>('globe_income_adj_z', entry, 'number'),
                tax_expense_with_respect_to_covered_taxes: getValueFromKeyIfTypeCompatible<number>('tax_expense_with_respect_to_covered_taxes', entry, 'number'),
                covered_taxes_adj_a: getValueFromKeyIfTypeCompatible<number>('covered_taxes_adj_a', entry, 'number'),
                covered_taxes_adj_b: getValueFromKeyIfTypeCompatible<number>('covered_taxes_adj_b', entry, 'number'),
                covered_taxes_adj_c: getValueFromKeyIfTypeCompatible<number>('covered_taxes_adj_c', entry, 'number'),
                covered_taxes_adj_d: getValueFromKeyIfTypeCompatible<number>('covered_taxes_adj_d', entry, 'number'),
                covered_taxes_adj_e: getValueFromKeyIfTypeCompatible<number>('covered_taxes_adj_e', entry, 'number'),
                covered_taxes_adj_f: getValueFromKeyIfTypeCompatible<number>('covered_taxes_adj_f', entry, 'number'),
                covered_taxes_adj_g: getValueFromKeyIfTypeCompatible<number>('covered_taxes_adj_g', entry, 'number'),
                covered_taxes_adj_h: getValueFromKeyIfTypeCompatible<number>('covered_taxes_adj_h', entry, 'number'),
                covered_taxes_adj_i: getValueFromKeyIfTypeCompatible<number>('covered_taxes_adj_i', entry, 'number'),
                covered_taxes_adj_j: getValueFromKeyIfTypeCompatible<number>('covered_taxes_adj_j', entry, 'number'),
                covered_taxes_adj_k: getValueFromKeyIfTypeCompatible<number>('covered_taxes_adj_k', entry, 'number'),
                covered_taxes_adj_l: getValueFromKeyIfTypeCompatible<number>('covered_taxes_adj_l', entry, 'number'),
                covered_taxes_adj_m: getValueFromKeyIfTypeCompatible<number>('covered_taxes_adj_m', entry, 'number'),
                covered_taxes_adj_n: getValueFromKeyIfTypeCompatible<number>('covered_taxes_adj_n', entry, 'number'),
                covered_taxes_adj_o: getValueFromKeyIfTypeCompatible<number>('covered_taxes_adj_o', entry, 'number'),
                covered_taxes_adj_p: getValueFromKeyIfTypeCompatible<number>('covered_taxes_adj_p', entry, 'number'),
                covered_taxes_adj_q: getValueFromKeyIfTypeCompatible<number>('covered_taxes_adj_q', entry, 'number'),
                covered_taxes_adj_r: getValueFromKeyIfTypeCompatible<number>('covered_taxes_adj_r', entry, 'number'),
                payroll_costs: getValueFromKeyIfTypeCompatible<number>('payroll_costs', entry, 'number'),
                tangible_assets: getValueFromKeyIfTypeCompatible<number>('tangible_assets', entry, 'number'),
                additional_TUT: getValueFromKeyIfTypeCompatible<number>('additional_TUT', entry, 'number'),
                domestic_TUT: getValueFromKeyIfTypeCompatible<number>('domestic_TUT', entry, 'number')
            }
        })
    }
}
