export = CountDownLatch;
declare class CountDownLatch extends EventEmitter {
    constructor(counter?: number);
    counter: number;
    doneEmitted: boolean;
    countUp(increment?: number): void;
    countDown(decrement?: number): void;
}
import EventEmitter = require("events");
