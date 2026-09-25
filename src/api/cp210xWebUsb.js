export const CP210X_VENDOR_ID = 0x10c4;

const CP210X_IFC_ENABLE = 0x00;
const CP210X_SET_LINE_CTL = 0x03;
const CP210X_SET_MHS = 0x07;
const CP210X_SET_BAUDRATE = 0x1e;

const LINE_CTL_8N1 = 0x0800;

const MHS_CONTROL_DTR = 0x0001;
const MHS_CONTROL_RTS = 0x0002;
const MHS_CONTROL_WRITE_DTR = 0x0100;
const MHS_CONTROL_WRITE_RTS = 0x0200;

const READ_CHUNK_SIZE = 64;

class Cp210xSerialPort {
    constructor(device) {
        this.device = device;
        this.readable = null;
        this.writable = null;
        this._interfaceNumber = 0;
        this._endpointIn = null;
        this._endpointOut = null;
        this._reading = false;
    }

    getInfo() {
        return { usbVendorId: this.device.vendorId, usbProductId: this.device.productId };
    }

    async _controlOut(request, value, data) {
        await this.device.controlTransferOut(
            { requestType: 'vendor', recipient: 'interface', request, value, index: this._interfaceNumber },
            data,
        );
    }

    async setBaudRate(baud) {
        const payload = new Uint8Array(4);
        new DataView(payload.buffer).setUint32(0, baud, true);
        await this._controlOut(CP210X_SET_BAUDRATE, 0, payload);
    }

    async setSignals({ dataTerminalReady, requestToSend } = {}) {
        let control = 0;
        let mask = 0;
        if (dataTerminalReady !== undefined) {
            mask |= MHS_CONTROL_WRITE_DTR;
            if (dataTerminalReady) control |= MHS_CONTROL_DTR;
        }
        if (requestToSend !== undefined) {
            mask |= MHS_CONTROL_WRITE_RTS;
            if (requestToSend) control |= MHS_CONTROL_RTS;
        }
        await this._controlOut(CP210X_SET_MHS, mask | control);
    }

    async open({ baudRate = 115200 } = {}) {
        if (!this.device.opened) {
            await this.device.open();
        }
        if (this.device.configuration === null) {
            await this.device.selectConfiguration(1);
        }

        const iface = this.device.configuration.interfaces[0];
        const alternate = iface.alternates[0];
        this._interfaceNumber = iface.interfaceNumber;
        await this.device.claimInterface(this._interfaceNumber);

        const endpointIn = alternate.endpoints.find((e) => e.direction === 'in' && e.type === 'bulk');
        const endpointOut = alternate.endpoints.find((e) => e.direction === 'out' && e.type === 'bulk');
        if (!endpointIn || !endpointOut) {
            throw new Error('El dispositivo CP210x no expone los endpoints bulk esperados.');
        }
        this._endpointIn = endpointIn.endpointNumber;
        this._endpointOut = endpointOut.endpointNumber;

        await this._controlOut(CP210X_IFC_ENABLE, 1);
        await this.setBaudRate(baudRate);
        await this._controlOut(CP210X_SET_LINE_CTL, LINE_CTL_8N1);

        this._reading = true;
        this.readable = new ReadableStream({
            pull: async (controller) => {
                if (!this._reading) {
                    controller.close();
                    return;
                }
                try {
                    const result = await this.device.transferIn(this._endpointIn, READ_CHUNK_SIZE);
                    if (result.status === 'ok' && result.data && result.data.byteLength > 0) {
                        controller.enqueue(new Uint8Array(result.data.buffer, result.data.byteOffset, result.data.byteLength));
                    }
                } catch (error) {
                    if (this._reading) controller.error(error);
                }
            },
            cancel: () => {
                this._reading = false;
            },
        });

        this.writable = new WritableStream({
            write: async (chunk) => {
                await this.device.transferOut(this._endpointOut, chunk);
            },
        });
    }

    async close() {
        this._reading = false;
        try { if (this.readable && !this.readable.locked) await this.readable.cancel(); } catch (e) {}
        try { await this._controlOut(CP210X_IFC_ENABLE, 0); } catch (e) {}
        try { await this.device.releaseInterface(this._interfaceNumber); } catch (e) {}
        try { await this.device.close(); } catch (e) {}
        this.readable = null;
        this.writable = null;
    }
}

const portsByDevice = new WeakMap();

function wrapDevice(device) {
    let port = portsByDevice.get(device);
    if (!port) {
        port = new Cp210xSerialPort(device);
        portsByDevice.set(device, port);
    }
    return port;
}

export const cp210xSerial = {
    async requestPort() {
        const device = await navigator.usb.requestDevice({ filters: [{ vendorId: CP210X_VENDOR_ID }] });
        return wrapDevice(device);
    },
    async getPorts() {
        const devices = await navigator.usb.getDevices();
        return devices.filter((d) => d.vendorId === CP210X_VENDOR_ID).map(wrapDevice);
    },
};
