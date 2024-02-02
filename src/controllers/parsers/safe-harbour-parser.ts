import {InputSafeHarbourSource} from "../safe-harbour/safe-harbour.interface";
import {getValueFromKeyIfTypeCompatible, getValueFromKeyIfTypeCompatibleMandatory} from "../../utils/common";

export function safeHarbourParser(jsonData: {pi2_safe_harbour: {}[]}): InputSafeHarbourSource {
    return {
        pi2_safe_harbour_entries: jsonData.pi2_safe_harbour?.map(entry => {
            return {
                entity_id: getValueFromKeyIfTypeCompatibleMandatory<string>('entity_id', entry, 'string'),
                total_revenue: getValueFromKeyIfTypeCompatible<number>('total_revenue', entry, 'number'),
                PBT: getValueFromKeyIfTypeCompatible<number>('PBT', entry, 'number'),
                simplified_covered_tax: getValueFromKeyIfTypeCompatible<number>('simplified_covered_tax', entry, 'number'),
                payroll_costs: getValueFromKeyIfTypeCompatible<number>('payroll_costs', entry, 'number'),
                tangible_assets: getValueFromKeyIfTypeCompatible<number>('tangible_assets', entry, 'number')
            }
        })
    }
}
