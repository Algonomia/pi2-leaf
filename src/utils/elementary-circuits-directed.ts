import {Matrix} from "mathjs";

const findCircuits = require("elementary-circuits-directed-graph");

export class ElementaryCircuitsDirected {

    public static getCircuits(adjacentMatrix: Matrix): number[][] {
        const adjacencyList: number[][] = [];
        // @ts-ignore
        adjacentMatrix.forEach((value, index: [number, number]) => {
            if (value !== 0) {
                if (!adjacencyList[index[0]]) {
                    adjacencyList[index[0]] = [index[1]];
                } else {
                    adjacencyList[index[0]].push(index[1]);
                }
            }
        }, true);
        return findCircuits(adjacencyList);
    }

}
