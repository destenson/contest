const EventEmitter = require('events');
const myEmitter = new EventEmitter();

function throwPromise() {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      reject('Test Error');
    }, 10);
  });
}

function assertPromise(...args) {
  return new Promise((resolve) => {
    setTimeout(() => {
      myEmitter.emit('event', args);
      if (args.length === 0) {
        return resolve(null);
      }
      if (args.length === 1) {
        return resolve(args[0]);
      }
      return resolve(args);
    }, 10);
  });
}

export default {
  contract_name: 'MockContract',
  assertTxMethod: () => assertPromise('hash'),
  throwTxMethod: throwPromise,
  assertMethod: {
    call: assertPromise,
  },
  assertMethod1: { call: () => assertPromise(1) },
  assertMethod2: { call: () => assertPromise(2) },
  eventMethod: assertPromise,
  throwMethod: {
    call: throwPromise,
  },
  AssertEvent() {
    let watching;
    let callback = () => {};
    const emit = function (data) {
      if (callback && watching) {
        const transformedData = {};
        data.forEach((i, j) => { transformedData[j] = i; });
        callback(null, { args: transformedData });
      }
    };
    myEmitter.on('event', emit);
    return {
      watch(cb) {
        watching = true;
        callback = cb;
      },
      stopWatching() {
        watching = false;
      },
    };
  },
  // ThrowEvent:
  triggerEvent(eventName, eventData) {
    // AssertEvent
  },
};
