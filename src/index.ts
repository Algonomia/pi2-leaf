import express from 'express';
import path from "path";
import {Scope} from "./controllers/scope/scope";
import {TopUpTaxComputation} from "./controllers/top-up-tax-computation/top-up-tax-computation";
import {scopeParser} from "./controllers/parsers/scope-parser";
import {topUpTaxComputationParser} from "./controllers/parsers/top-up-tax-computation-parser";
import cors from 'cors';
import {ChargingProvisions} from "./controllers/charging-provisions/charging-provisions";
import {SafeHarbour} from "./controllers/safe-harbour/safe-harbour";
import {safeHarbourParser} from "./controllers/parsers/safe-harbour-parser";

const hash = require('object-hash');

const app = express();
const port = 3000;

const cacheMap = new Map<string, any>();

app.use(express.json({limit: '50mb'}));
app.use(express.urlencoded({limit: '50mb'}));
app.use(cors({
    credentials: true,
    origin: 'http://localhost:4200'
}));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, './utils/homepage.html'));
});

app.post('/scope', function(req, res, next) {
    try {
        const scope = new Scope(scopeParser(req.body));
    } catch (e) {
        console.error(e);
        res.sendStatus(500);
    }
});

app.post('/scope/broken', function(req, res, next) {
    try {
        const scope = new Scope(scopeParser(req.body));
        res.send(scope.brokenChains);
    } catch (e) {
        console.error(e);
        res.sendStatus(500);
    }
});

app.post('/scope/consoFail', function(req, res, next) {
    try {
        const scope = new Scope(scopeParser(req.body));
        res.send(scope.consolidationMethodsFailedEntityList);
    } catch (e) {
        console.error(e);
        res.sendStatus(500);
    }
});


app.post('/scope/detentionMatrix', async function(req, res, next) {
    try {
        const scope = new Scope(scopeParser(req.body));
        res.send(await scope.getDetentionMatrix());
    } catch (e) {
        console.error(e);
        res.sendStatus(500);
    }
});

app.post('/scope/detentionByUPE', async function(req, res, next) {
    try {
        const scope = new Scope(scopeParser(req.body));
        res.send(await scope.getDetentionsByUPE());
    } catch (e) {
        console.error(e);
        res.sendStatus(500);
    }
});

app.post('/scope/allCycles', async function(req, res, next) {
    try {
        const scope = new Scope(scopeParser(req.body));
        res.send(scope.getAllElementaryCycles());
    } catch (e) {
        console.error(e);
        res.sendStatus(500);
    }
});

app.post('/scope/maxDegreeParentalityMatrix', async function(req, res, next) {
    try {
        const scope = new Scope(scopeParser(req.body));
        res.send(await scope.getDegreeParentalityMatrix('max'));
    } catch (e) {
        console.error(e);
        res.sendStatus(500);
    }
});

app.post('/scope/ownershipOut', async function(req, res, next) {
    try {
        const scope = new Scope(scopeParser(req.body));
        res.send({ownerships: await scope.getOwnershipOut()});
    } catch (e) {
        console.error(e);
        res.sendStatus(500);
    }
});

app.post('/scope/excludedEntities', async function(req, res, next) {
    try {
        const scope = new Scope(scopeParser(req.body));
        res.send(await scope.getExcludedEntities());
    } catch (e) {
        console.error(e);
        res.sendStatus(500);
    }
});

app.post('/tut/getTut', async function(req, res, next) {
    try {
        const scope = new Scope(scopeParser(req.body));
        const tutComputation = new TopUpTaxComputation(topUpTaxComputationParser(req.body), scope);
        const subPerimeters = [...new Set((await scope.getSubPerimeters()).values())];
        const brokenChains = scope.brokenChains;
        const consolidationMethodsFailedEntity = scope.consolidationMethodsFailedEntityList;
        res.send({
            subPerimeters: subPerimeters,
            entities: await scope.getEntitiesOut(),
            tut: await tutComputation.getTUTOut(),
            entitiesWithNoUPE: brokenChains.entitiesWithNoUPE,
            entitiesInGroupNotInUPE: brokenChains.entitiesInGroupNotInUPE,
            entitiesNotReallyOutOfGroup: brokenChains.entitiesNotReallyOutOfGroup,
            consolidationMethodsFailedEntity
        });
    } catch (e) {
        console.error(e);
        res.sendStatus(500);
    }
});

app.post('/getAll', async function(req, res, next) {
    try {
        const sign = hash(req.body);
        if (!cacheMap.has(sign)) {
            const scope = new Scope(scopeParser(req.body));
            const safeHarbour = new SafeHarbour(safeHarbourParser(req.body), scope, 2024);
            const tutComputation = new TopUpTaxComputation(topUpTaxComputationParser(req.body), scope);
            const chargingProvisions = new ChargingProvisions(scope, tutComputation);
            const subPerimeters = [...new Set((await scope.getSubPerimeters()).values())];
            const brokenChains = scope.brokenChains;
            const consolidationMethodsFailedEntity = scope.consolidationMethodsFailedEntityList;
            cacheMap.set(sign, {
                subPerimeters: subPerimeters,
                entities: await scope.getEntitiesOut(),
                tut: await tutComputation.getTUTOut(),
                elections: await chargingProvisions.getElectionsOut(),
                chargingProvisions: await chargingProvisions.getChargingProvisionsOut(),
                allocableShares: await chargingProvisions.getAllocableSharesOut(),
                ownerships: await scope.getOwnershipOut(),
                entitiesWithNoUPE: brokenChains.entitiesWithNoUPE,
                entitiesInGroupNotInUPE: brokenChains.entitiesInGroupNotInUPE,
                entitiesNotReallyOutOfGroup: brokenChains.entitiesNotReallyOutOfGroup,
                consolidationMethodsFailedEntity,
                safeHarbour: await safeHarbour.getSafeHarbourOut()
            });
        }
        res.send(cacheMap.get(sign));
    } catch (e) {
        console.error(e);
        res.sendStatus(500);
    }
});

app.listen(port, () => {
    return console.log(`server is listening on ${port}`);
});
