import BaseAccessory from './BaseAccessory';
import { TuyaDeviceStatus } from '../device/TuyaDevice';
import { configureCurrentRelativeHumidity } from './characteristic/CurrentRelativeHumidity';
import { configureCurrentTemperature } from './characteristic/CurrentTemperature';
import { TuyaPlatform } from '../platform';
import { PlatformAccessory } from 'homebridge';

const SCHEMA_CODE = {
  SENSOR_STATUS: ['va_temperature', 'va_humidity', 'humidity_value'],
  CURRENT_TEMP: ['va_temperature'],
  CURRENT_HUMIDITY: ['va_humidity', 'humidity_value'],
};

export default class TemperatureHumiditySensorAccessory extends BaseAccessory {

  constructor(
    public readonly platform: TuyaPlatform,
    public readonly accessory: PlatformAccessory,
  ) {
    super(platform, accessory);
    platform.thSensor = this;
  }

  requiredSchema() {
    return [SCHEMA_CODE.SENSOR_STATUS];
  }

  configureServices(): void {
    configureCurrentTemperature(this, undefined, this.getSchema(...SCHEMA_CODE.CURRENT_TEMP));
    configureCurrentRelativeHumidity(this, undefined, this.getSchema(...SCHEMA_CODE.CURRENT_HUMIDITY));
  }

  async onDeviceStatusUpdate(status: TuyaDeviceStatus[]) {
    super.onDeviceStatusUpdate(status);

    for (const accessory of this.platform.acHandlersUsingTHSensor) {
      await accessory.updateAllValues();
    }
  }
}
