import assert from 'assert';
import Tempo from '@digix/tempo';

import parser from './parse_inputs';
import dispatcher from './test_dispatcher';

export default class Contest {
  constructor({ debug = false, timeout } = {}) {
    this.config = { debug, timeout };
    this._contract = null;
    this._actionQueue = [];
    return this;
  }
  // for the new version of truffle....
  artifact(truffleArtifact) {
    const _init = this._init.bind(this);
    this.describe(`~~~ Contract: ${truffleArtifact.toJSON().contract_name} ~~~\n`);
    this.it('is deployed', function () {
      return truffleArtifact.deployed().then((instance) => _init(instance));
    });
    return this;
  }
  // uses already-deployed contract
  use(contract) {
    // if we pass the text we create an upper level describe block
    if (!contract) { throw new Error('Contract not defined!'); }
    const _init = this._init.bind(this);
    this.describe(contract.contract_name);
    this.it('', function () {
      return _init(contract);
    });
    return this;
  }
  // or deploy a new one
  deploy(newContract, args = []) {
    const _init = this._init.bind(this);
    this.describe(newContract.contract_name);
    this.it('deploys', function () {
      return newContract.new.apply(newContract, args)
      .then((contract) => _init(contract));
    });
    return this;
  }
  // or pluck deployed one from truffle's global namespace
  deployed(contractName) {
    if (!contractName || global[contractName]) { throw new Error('Contract not defined!'); }
    const _init = this._init.bind(this);
    this.describe('Truffle deployment');
    this.it('is deployed', function () {
      const contract = global[contractName].deployed();
      // backwards compatibility with old truffle version
      if (contract.address) {
        return _init(contract);
      }
      return contract.then((instance) => _init(instance));
    });
    return this;
  }
  // pass statment and method to parser
  _(...args) {
    const { config } = this;
    const { type } = args[args.length - 1];
    const opts = parser(args, type);
    const promise = dispatcher({ ...opts, config, contract: this._getContract.bind(this) });
    this._addToQueue({ opts, promise });
    return this;
  }
  tx(...args) {
    return this._.apply(this, [...args, { type: 'transaction' }]);
  }
  call(...args) {
    return this._.apply(this, [...args, { type: 'call' }]);
  }
  watch(...args) {
    return this._.apply(this, [...args, { type: 'event' }]);
  }
  // execute the current queue
  done() {
    const actions = this._actionQueue;
    this._actionQueue = [];
    if (!actions.length) { return this; }
    global.describe(this.describeBlock, function () {
      actions.forEach((fn) => {
        if (fn.promise) { return null; }
        return fn();
      });
    });
    return this;
  }
  it(statement, promise) {
    this._addCustomAction({ statement, promise });
    return this;
  }
  then(promise) {
    this._addCustomAction({ promise, type: 'then', before: true });
    return this;
  }
  wait(blocks, numberOfSeconds) {
    return this.then(() => {
      return new Promise((resolve) => {
        if (this.config.debug) {
          console.log(`Waiting ${blocks} blocks ${numberOfSeconds && `& ${numberOfSeconds} seconds`}`);
        }
        this.tempo.waitForBlocks(blocks, numberOfSeconds).then(resolve);
      });
    });
  }
  // describe blocks set up a new `it` queue
  describe(statement) {
    this.done();
    this.describeBlock = statement;
    return this;
  }
  _init(contract) {
    return new Promise((resolve) => {
      assert.ok(contract.address);
      this._setContract(contract);
      new Tempo(global.web3).then((instance) => {
        this.tempo = instance;
        resolve();
      });
    });
  }
  _addCustomAction({ statement, promise, type, before }) {
    this._addToQueue({
      promise: () => {
        // resolve promise or promisify regular functions
        return new Promise((resolve, reject) => {
          const p = promise(this._getContract());
          if (p && p.then) {
            return p.then(resolve).catch(reject);
          }
          return resolve();
        });
      },
      opts: {
        statement,
        type,
        before,
      },
    });
  }
  // internal queue method
  _addToQueue({ opts, promise }) {
    const { type, statement, before } = opts;
    const eventObj = { promise, type, statement, before };
    const previousAction = this._actionQueue[this._actionQueue.length - 1] || {};
    if (previousAction.type === 'event' && eventObj.type !== 'transaction') {
      throw new Error('`watch` must be followed by `tx`!');
    }
    if (previousAction.before) {
      // previous action should can executed in series
      eventObj.promise = (args) => {
        return new Promise((resolve, reject) => {
          // pass up the assersion failure
          previousAction.promise().catch(reject)
          .then(() => promise(args).catch(reject))
          .then(resolve).catch(reject);
        });
      };
      // if this item is an event or then, overwrite previous.
      if (eventObj.before || eventObj.type === 'event') {
        this._actionQueue[this._actionQueue.length - 1] = eventObj;
        return this;
      }
    }
    // if we are then, but previous wasn't, push a new block
    if (eventObj.before || eventObj.type === 'event') {
      // TODO do something if prev action is event?
      this._actionQueue.push(eventObj);
      return this;
    }
    const { timeout } = this.config;
    // ensure events create an it statement
    if (previousAction.type === 'event') {
      this._actionQueue[this._actionQueue.length - 1] = function () {
        global.it(`${previousAction.statement} & ${statement}`, function () {
          if (timeout) { this.timeout(timeout); }
          return previousAction.promise(eventObj.promise);
        });
      };
      return this;
    }
    // default action
    this._actionQueue.push(function () {
      global.it(statement, function () {
        if (timeout) { this.timeout(timeout); }
        return eventObj.promise();
      });
    });

    return this;
  }
  // return current instance of contract
  _getContract() {
    return this._contract;
  }
  // set contract instance
  _setContract(contract) {
    this._contract = contract;
  }
}
