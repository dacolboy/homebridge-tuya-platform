import debounce from 'debounce';
import BaseAccessory from './BaseAccessory';
import AccessoryFactory from '../accessory/AccessoryFactory';
import { PLATFORM_NAME, PLUGIN_NAME } from '../settings';

const POWER_OFF = 0;
const POWER_ON = 1;

const AC_MODE_COOL = 0;
const AC_MODE_HEAT = 1;
const AC_MODE_AUTO = 2;
const AC_MODE_FAN = 3;
const AC_MODE_DEHUMIDIFIER = 4;

const FAN_SPEED_AUTO = 0;
const FAN_SPEED_LOW = 1;
// const FAN_SPEED_MEDIUM = 2;
const FAN_SPEED_HIGH = 3;

export default class IRDehumidifierAccessory extends BaseAccessory {
  private parentAC_id!: string;

  configureServices() {
    this.configureDehumidifier();
    //this.configureFan();
    this.platform.acHandlersUsingTHSensor.push(this);
    this.parentAC_id = this.device.id.substring(0, this.device.id.length - 3);
  }

  configureDehumidifier() {
    if (!this.supportDehumidifier()) {
      return;
    }

    const service = this.dehumidifierService();
    const { INACTIVE, ACTIVE } = this.Characteristic.Active;

    // Required Characteristics
    service.getCharacteristic(this.Characteristic.Active)
      .onGet(() => {
        return (this.getMode() === AC_MODE_DEHUMIDIFIER && this.getPower() === POWER_ON) ? ACTIVE : INACTIVE;
      })
      .onSet(async value => {
        if (value === ACTIVE) {
          // Turn off AC & Fan
          this.platform.getAccessoryHandler(this.parentAC_id)?.accessory.getService(this.Service.HeaterCooler)
            ?.getCharacteristic(this.Characteristic.Active).updateValue(INACTIVE);
        }

        this.setMode(AC_MODE_DEHUMIDIFIER);
        this.setPower((value === ACTIVE) ? POWER_ON : POWER_OFF);
      });

    const { DEHUMIDIFYING } = this.Characteristic.CurrentHumidifierDehumidifierState;
    service.setCharacteristic(this.Characteristic.CurrentHumidifierDehumidifierState, DEHUMIDIFYING);

    const { DEHUMIDIFIER } = this.Characteristic.TargetHumidifierDehumidifierState;
    service.getCharacteristic(this.Characteristic.TargetHumidifierDehumidifierState)
      .updateValue(DEHUMIDIFIER)
      .setProps({ validValues: [DEHUMIDIFIER] });

    service.getCharacteristic(this.Characteristic.CurrentRelativeHumidity)
      .onGet(() => {
        const handler = this.platform.thSensor!.accessory
          .getService(this.Service.HumiditySensor)
          ?.getCharacteristic(this.Characteristic.CurrentRelativeHumidity)['getHandler'];
        const humidity = handler ? handler() : 0;
        return humidity;
      });

    // Optional Characteristics
    this.configureRotationSpeed(service);

    service.getCharacteristic(this.Characteristic.RelativeHumidityDehumidifierThreshold)
      .onGet(() => 0)
      .onSet(async value => {
        this.setMode(AC_MODE_DEHUMIDIFIER);
        this.setPower((value === ACTIVE) ? POWER_ON : POWER_OFF);
      });
  }

  configureFan() {
    if (!this.supportFan()) {
      return;
    }

    const service = this.fanService();
    const { INACTIVE, ACTIVE } = this.Characteristic.Active;

    // Required Characteristics
    service.getCharacteristic(this.Characteristic.Active)
      .onGet(() => {
        return (this.getMode() === AC_MODE_FAN && this.getPower() === POWER_ON) ? ACTIVE : INACTIVE;
      })
      .onSet(async value => {
        if (value === ACTIVE) {
          // Turn off AC & Dehumidifier
          this.supportDehumidifier() && this.dehumidifierService().getCharacteristic(this.Characteristic.Active).updateValue(INACTIVE);
        }

        this.setMode(AC_MODE_FAN);
        this.setPower((value === ACTIVE) ? POWER_ON : POWER_OFF);
      });

    // Optional Characteristics
    this.configureTargetFanState(service);
    this.configureRotationSpeed(service);
  }

  dehumidifierService() {
    return this.accessory.getService(this.Service.HumidifierDehumidifier)
      || this.accessory.addService(this.Service.HumidifierDehumidifier, this.accessory.displayName + ' Dehumidifier');
  }

  fanService() {
    return this.accessory.getService(this.Service.Fanv2)
      || this.accessory.addService(this.Service.Fanv2, this.accessory.displayName + ' Fan');
  }

  getPower() {
    const value = this.getStatus('power')?.value || '0';
    return (value === true || parseInt(value.toString()) === 1) ? POWER_ON : POWER_OFF;
  }

  setPower(value) {
    this.getStatus('power')!.value = value;
    this.debounceSendACCommands();
  }

  getMode() {
    const value = this.getStatus('mode')?.value || '0';
    return parseInt(value.toString());
  }

  setMode(value) {
    this.getStatus('mode')!.value = value;
    this.debounceSendACCommands();
  }

  getWind() {
    const value = this.getStatus('wind')?.value || '0';
    return parseInt(value.toString());
  }

  setWind(value) {
    this.getStatus('wind')!.value = value;
    this.debounceSendACCommands();
  }

  getTemp() {
    const value = this.getStatus('temp')?.value || '0';
    return parseInt(value.toString());
  }

  setTemp(value) {
    this.getStatus('temp')!.value = value;
    this.debounceSendACCommands();
  }

  getKeyRangeItem(mode: number) {
    const key_range = this.device.remote_keys?.key_range || [];
    return key_range.find(item => item.mode === mode);
  }

  supportDehumidifier() {
    return this.getKeyRangeItem(AC_MODE_DEHUMIDIFIER) !== undefined;
  }

  supportFan() {
    return this.getKeyRangeItem(AC_MODE_FAN) !== undefined;
  }

  getTempRange(mode: number) {
    const keyRangeItem = this.getKeyRangeItem(mode);
    if (!keyRangeItem || !keyRangeItem.temp_list || keyRangeItem.temp_list.length === 0) {
      return undefined;
    }

    const tempList = keyRangeItem.temp_list.map((temp) => temp.temp);

    const min = Math.min(...tempList);
    const max = Math.max(...tempList);
    return [min, max];
  }

  getParentAccessory() {
    return this.platform.accessoryHandlers.find(accessory => accessory.device.id === this.device.parent_id)!;
  }

  configureTargetFanState(service) {
    const { MANUAL, AUTO } = this.Characteristic.TargetFanState;
    service.getCharacteristic(this.Characteristic.TargetFanState)
      .onGet(() => (this.getWind() === FAN_SPEED_AUTO) ? AUTO : MANUAL)
      .onSet(async value => {
        this.setWind((value === AUTO) ? FAN_SPEED_AUTO : FAN_SPEED_LOW);
      });
  }

  configureRotationSpeed(service) {
    service.getCharacteristic(this.Characteristic.RotationSpeed)
      .onGet(() => (this.getWind() === FAN_SPEED_AUTO) ? FAN_SPEED_AUTO : this.getWind())
      .onSet(async value => {
        // if (this.getWind() === FAN_SPEED_AUTO) {
        //   return;
        // }
        //if (value !== 0) {
        this.setWind(value);
        //}
      })
      .setProps({ minValue: 0, maxValue: 3, minStep: 1, unit: 'speed' });
  }

  debounceSendACCommands = debounce(this.sendACCommands, 200);

  async sendACCommands() {
    const { parent_id } = this.device;
    await this.deviceManager.sendInfraredACCommands(parent_id!, this.parentAC_id, this.getPower(), this.getMode(), this.getTemp(), this.getWind());
  }
}
