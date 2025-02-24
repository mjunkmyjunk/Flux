import { xf, exists, empty, equals, first, second, last, inRange, fixInRange, dateToDashString } from '../functions.js';
import { LocalStorageItem } from '../storage/local-storage.js';
import { IDBStore } from '../storage/idb-store.js';
import { Session as IDBSessionStore } from '../storage/session.js';
import { idb } from '../storage/idb.js';
import { uuid } from '../storage/uuid.js';
import { workouts as workoutsFile }  from '../workouts/workouts.js';
import { zwo } from '../workouts/parser.js';
import { fileHandler } from '../file.js';
import { Encode } from '../ant/fit.js';

class Model {
    constructor(args) {
        this.init(args);
        this.prop = args.prop;
        this.default = args.default || this.defaultValue();
        this.prev = args.default;
        this.set = args.set || this.defaultSet;
        this.isValid = args.isValid || this.defaultIsValid;
        this.onInvalid = args.onInvalid || this.defaultOnInvalid;
        this.storage = this.defaultStorage();
        this.postInit(args);
    }
    init() { return; }
    postInit() { return; }
    defaultValue() { return ''; }
    defaultIsValid(value) { return exists(value); }
    defaultSet(value) {
        const self = this;
        if(self.isValid(value)) {
            return value;
        } else {
            self.defaultOnInvalid(value);
            return self.default;
        }
    }
    defaultOnInvalid(x) {
        const self = this;
        console.error(`Trying to set invalid ${self.prop}. ${typeof x}`, x);
    }
    defaultStorage() {
        const self = this;
        return {set: ((x)=>x),
                restore: ((_)=> self.default)};
    }
    backup(value) {
        const self = this;
        self.storage.set(value);
    }
    restore() {
        const self = this;
        return self.storage.restore();
    }
}

class Power extends Model {
    postInit(args) {
        this.min = args.min || 0;
        this.max = args.max || 2500;
    }
    defaultValue() { return 0; }
    defaultIsValid(value) {
        return Number.isInteger(value) && inRange(self.min, self.max, value);
    }
}

class HeartRate extends Model {
    postInit(args) {
        this.min = args.min || 0;
        this.max = args.max || 255;
    }
    defaultValue() { return 0; }
    defaultIsValid(value) {
        const self = this;
        return Number.isInteger(value) && inRange(self.min, self.max, value);
    }
}

class Cadence extends Model {
    postInit(args) {
        this.min = args.min || 0;
        this.max = args.max || 255;
    }
    defaultValue() { return 0; }
    defaultIsValid(value) {
        return Number.isInteger(value) && inRange(self.min, self.max, value);
    }
}

class Speed extends Model {
    postInit(args) {
        this.min = args.min || 0;
        this.max = args.max || 120;
    }
    defaultValue() { return 0; }
    defaultIsValid(value) {
        return (Number.isInteger(value) || Number.isFloat(value)) &&
            inRange(self.min, self.max, value);
    }
}

class Distance extends Model {
    postInit(args) {}
    defaultValue() { return 0; }
    defaultIsValid(value) {
        return Number.isInteger(value) || Number.isFloat(value);
    }
}

class Sources extends Model {
    postInit(args) {
        const self = this;
        self.state = self.default;
        xf.sub('db:sources', value => self.state = value);
    }
    defaultSet(target, sources) {
        return Object.assign(target, sources);
    }
    isSource(value, id) {
        const self = this;
        if(exists(self.state[value])) {
            return equals(self.state[value], id);
        }
        return false;
    }
    defaultValue() {
        const sources = {
            power: 'ble:controllable',
            cadence: 'ble:controllable',
            speed: 'ble:controllable',
            control: 'ble:controllable',
            heartRate: 'ble:hrm'
        };
        return sources;
    }
}

class Target extends Model {
    postInit(args) {
        this.min = args.min || 0;
        this.max = args.max || 100;
        this.step = args.step || 1;
    }
    defaultValue() { return 0; }
    defaultIsValid(value) {
        const self = this;
        return Number.isInteger(value) && inRange(self.min, self.max, value);
    }
    defaultSet(value) {
        const self = this;
        if(isNaN(value)) {
            self.onInvalid();
            return self.default;
        }
        return fixInRange(self.min, self.max, self.parse(value));
    }
    parse(value) { return parseInt(value); }
    inc(value) {
        const self = this;
        const x = value + self.step;
        return self.set(x);
    }
    dec(value) {
        const self = this;
        const x = value - self.step;
        return self.set(x);
    }
}

class PowerTarget extends Target {
    postInit(args) {
        this.min = args.min || 0;
        this.max = args.max || 800;
        this.step = args.step || 10;
    }
}

class ResistanceTarget extends Target {
    postInit(args) {
        this.min = args.min || 0;
        this.max = args.max || 100;
        this.step = args.step || 10;
    }
}

class SlopeTarget extends Target {
    postInit(args) {
        this.min = args.min || 0;
        this.max = args.max || 45;
        this.step = args.step || 0.5;
    }
    defaultIsValid(value) {
        const self = this;
        return Number.isFloat(value) && inRange(self.min, self.max, value);
    }
    parse(value) { return parseFloat(value); }
}

class Mode extends Model {
    postInit(args) {
        this.values = ['erg', 'resistance', 'slope'];
    }
    defaultValue() { return 'erg'; }
    defaultIsValid(value) { return this.values.includes(value); }
}

class Page extends Model {
    postInit(args) {
        this.values = ['settings', 'home', 'workouts'];
    }
    defaultValue() { return 'home'; }
    defaultIsValid(value) { return this.values.includes(value); }
}

class FTP extends Model {
    postInit(args) {
        const self = this;
        const storageModel = {
            key: self.prop,
            default: self.defaultValue(),
        };
        self.min = args.min || 0;
        self.max = args.max || 500;
        self.storage = new args.storage(storageModel);
        self.zones = args.zones || self.defaultZones();
        self.percentages = args.percentages || self.defaultPercentages();
    }
    defaultValue() { return 200; }
    defaultIsValid(value) {
        const self = this;
        return Number.isInteger(value) && inRange(self.min, self.max, value);
    }
    defaultZones() {
        return ['one', 'two', 'three', 'four', 'five', 'six', 'seven'];
    }
    defaultPercentages() {
        return {'one': 0.55, 'two': 0.76, 'three': 0.88, 'four': 0.95, 'five': 1.06, 'six': 1.20};
    }
    powerToZone(value, ftp, zones) {
        const self = this;
        if(!exists(ftp)) ftp = self.default;
        if(!exists(zones)) zones = self.zones;

        let name = zones[0];
        if(value < (ftp * self.percentages.one)) {
            name = zones[0];
        } else if(value < (ftp * self.percentages.two)) {
            name = zones[1];
        } else if(value < (ftp * self.percentages.three)) {
            name = zones[2];
        } else if(value < (ftp * self.percentages.four)) {
            name = zones[3];
        } else if(value < (ftp * self.percentages.five)) {
            name = zones[4];
        } else if (value < (ftp * self.percentages.six)) {
            name = zones[5];
        } else {
            name = zones[6];
        }
        return {name: name};
    }
}

class Weight extends Model {
    postInit(args) {
        const self = this;
        const storageModel = {
            key: self.prop,
            default: self.defaultValue(),
        };
        self.min = args.min || 0;
        self.max = args.max || 500;
        self.storage = new args.storage(storageModel);
    }
    defaultValue() { return 75; }
    defaultIsValid(value) {
        const self = this;
        return Number.isInteger(value) && inRange(self.min, self.max, value);
    }
}
class Theme extends Model {
    postInit(args) {
        const self = this;
        const storageModel = {
            key: self.prop,
            default: self.defaultValue(),
        };
        self.storage = new args.storage(storageModel);
        self.values = ['dark', 'light'];
    }
    defaultValue() { return 'dark'; }
    defaultIsValid(value) { return this.values.includes(value); }
    switch(theme) {
        const self = this;
        if(theme === first(self.values)) return second(self.values);
        if(theme === second(self.values)) return first(self.values);
        self.onInvalid(theme);
        return self.default;
    }
}
class Measurement extends Model {
    postInit(args) {
        const self = this;
        const storageModel = {
            key: self.prop,
            default: self.defaultValue(),
        };
        self.storage = new args.storage(storageModel);
        self.values = ['metric', 'imperial'];
    }
    defaultValue() { return 'metric'; }
    defaultIsValid(value) { return this.values.includes(value); }
    switch(theme) {
        const self = this;
        if(theme === first(self.values)) return second(self.values);
        if(theme === second(self.values)) return first(self.values);
        self.onInvalid(theme);
        return self.default;
    }
}

class Workout extends Model {
    postInit(args) {
        const self = this;
        const storageModel = {
            key: self.prop,
            default: self.defaultValue(),
        };
        self.storage = new args.storage(storageModel);
    }
    defaultValue() { return this.parse((first(workoutsFile))); }
    defaultIsValid(value) {
        return exists(value);
    }
    restore(db) {
        return first(db.workouts);
    }
    async readFromFile(workoutFile) {
        const workout = await fileHandler.readTextFile(workoutFile);
        return workout;
    }
    parse(workout) {
        return zwo.parse(workout);
    }
    fileName () {
        const self = this;
        const now = new Date();
        return `workout-${dateToDashString(now)}.fit`;
    }
    encode(db) {
        const self = this;
        let activity = Encode({data: db.records, laps: db.laps});
        return activity;
    }
    download(activity) {
        const self = this;
        const blob = new Blob([activity], {type: 'application/octet-stream'});
        fileHandler.saveFile()(blob, self.fileName());
    }
    save(db) {
        const self = this;
        self.download(self.encode(db));
    }
}

class Workouts extends Model {
    init(args) {
        const self = this;
        self.workoutModel = args.workoutModel;
    }
    postInit(args) {
        // const storageModel = {
        //     key: self.prop,
        //     default: self.defaultValue(),
        // };
        // self.storage = new args.storage(storageModel);
    }
    defaultValue() {
        const self = this;
        return workoutsFile.map((w) => Object.assign(self.workoutModel.parse(w), {id: uuid()}));
    }
    defaultIsValid(value) {
        const self = this;
        return exists(value);
    }
    restore() {
        const self = this;
        return self.default;
    }
    get(workouts, id) {
        for(let workout of workouts) {
            if(equals(workout.id, id)) {
                return workout;
            }
        }
        console.error(`tring to get a missing workout: ${id}`, workouts);
        return first(workouts);
    }
    add(workouts, workout) {
        const self = this;
        workouts.push(Object.assign(workout, {id: uuid()}));
        return workouts;
    }
}

class Session {
    constructor(args) {
        this.postInit(args);
    }
    postInit() {
        const me = this;
    }
    async start() {
        const me = this;
        me.store = new IDBSessionStore({idb: idb});
        await idb.open('store', 1, 'session');
    }
    backup(db) {
        const me = this;
        console.log('backing up session');
        me.store.set(idb, me.dbToSession(db));
    }
    async restore(db) {
        const me = this;
        const sessions = await me.store.restore();
        let session = last(sessions);
        if(!me.store.isEmpty(sessions)) {
          if(session.elapsed > 0) {
              me.sessionToDb(db, session);
          } else {
              me.store.clear(idb);
          }
        }
    }
    sessionToDb(db, session) {
        for(let prop in session) {
            if (session.hasOwnProperty(prop)) {
                db[prop] = session[prop];
            }
        }
    }
    dbToSession(db) {
        const session = {
            // Watch
            elapsed: db.elapsed,
            lapTime: db.lapTime,
            stepTime: db.stepTime,
            intervalIndex: db.intervalIndex,
            stepIndex: db.stepIndex,
            intervalDuration: db.intervalDuration,
            stepDuration: db.stepDuration,
            lapStartTime: db.lapStartTime,
            watchStatus: db.watchStatus,
            workoutStatus: db.workoutStatus,

            // Recording
            records: db.records,
            laps: db.laps,
            lap: db.lap,

            // Workouts
            workout: db.workout,
            mode: db.mode,
            page: db.page,

            // Targets
            powerTarget: db.powerTarget,
            resistanceTarget: db.resistanceTarget,
            slopeTarget: db.slopeTarget,
            sources: db.sources,

        };
        return session;
    }
}



const power = new Power({prop: 'power'});
const heartRate = new HeartRate({prop: 'heartRate'});
const cadence = new Cadence({prop: 'cadence'});
const speed = new Speed({prop: 'speed'});
const distance = new Distance({prop: 'distance'});
const sources = new Sources({prop: 'sources'});

const powerTarget = new PowerTarget({prop: 'powerTarget'});
const resistanceTarget = new ResistanceTarget({prop: 'resistanceTarget'});
const slopeTarget = new SlopeTarget({prop: 'slopeTarget'});
const mode = new Mode({prop: 'mode'});
const page = new Page({prop: 'page'});

const ftp = new FTP({prop: 'ftp', storage: LocalStorageItem});
const weight = new Weight({prop: 'weight', storage: LocalStorageItem});
const theme = new Theme({prop: 'theme', storage: LocalStorageItem});
const measurement = new Measurement({prop: 'measurement', storage: LocalStorageItem});

const workout = new Workout({prop: 'workout', storage: IDBStore});
const workouts = new Workouts({prop: 'workouts', workoutModel: workout});

const session = new Session();

let models = { power,
               heartRate,
               cadence,
               speed,
               sources,
               powerTarget,
               resistanceTarget,
               slopeTarget,
               mode,
               page,
               ftp,
               weight,
               theme,
               measurement,
               workout,
               workouts,
               session,
             };

export { models };
