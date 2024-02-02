import {Scope} from "./scope";
import scopeJson from "../../../spec/assets/scope.json"
import scopeJson2 from "../../../spec/assets/scope2.json"

describe("Scope part tests", function() {

    it("should parse json and fill entityList", function() {
        const scopeHandler = new Scope(<any>scopeJson);
        expect(scopeHandler.numberOfEntities()).toBeGreaterThan(1);
    });

    it("should get excluded entities (E1)", function() {
        const scopeHandler = new Scope(<any>scopeJson);
        const excludedEntityList = scopeHandler.getExcludedEntities();
        expect(Object.values(excludedEntityList).flat().length).toEqual(1);
    });


});
