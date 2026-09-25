import { serial as webUsbPolyfillSerial } from 'web-serial-polyfill';
import { cp210xSerial } from './cp210xWebUsb';

export const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

export const hasNativeSerial = typeof navigator !== 'undefined' && 'serial' in navigator && !isAndroid;
export const hasWebUsb = typeof navigator !== 'undefined' && 'usb' in navigator;

export const usingWebUsbPolyfill = !hasNativeSerial && hasWebUsb;

const defaultSerial = hasNativeSerial
    ? navigator.serial
    : (hasWebUsb ? webUsbPolyfillSerial : null);

export let serial = defaultSerial;

export const isSerialSupported = serial !== null;

export function resetToDefaultSerialBackend() {
    serial = defaultSerial;
}

export async function requestPortPreferringNativeOnAndroid() {
    if (isAndroid && hasWebUsb) {
        serial = cp210xSerial;
        return cp210xSerial.requestPort();
    }
    serial = defaultSerial;
    return serial.requestPort();
}

export function getSerialUnsupportedMessage() {
    if (hasNativeSerial || hasWebUsb) return null;
    return 'Este navegador no soporta Web Serial ni WebUSB. Usa Chrome o Edge (en Android, Chrome con WebUSB).';
}

export function errorMessage(err) {
    if (typeof err === 'string') return err;
    if (err && typeof err.message === 'string' && err.message) return err.message;
    try {
        return String(err);
    } catch (e) {
        return 'Error desconocido.';
    }
}
