"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Logger_1 = __importDefault(require("./Logger"));
const Transport_1 = __importDefault(require("./Transport"));
const logger = new Logger_1.default('WebRtcTransport');
class WebRtcTransport extends Transport_1.default {
    // WebRtcTransport data.
    // - .iceRole
    // - .iceParameters
    //   - .usernameFragment
    //   - .password
    //   - .iceLite
    // - .iceCandidates []
    //   - .foundation
    //   - .priority
    //   - .ip
    //   - .port
    //   - .type
    //   - .protocol
    //   - .tcpType
    // - .iceState
    // - .iceSelectedTuple
    //   - .localIp
    //   - .localPort
    //   - .remoteIp
    //   - .remotePort
    //   - .protocol
    // - .dtlsParameters
    //   - .role
    //   - .fingerprints []
    // - .dtlsState
    // - .dtlsRemoteCert
    // - .sctpParameters
    //   - .port
    //   - .OS
    //   - .MIS
    //   - .maxMessageSize
    // - .sctpState
    /**
     * @private
     * @emits {iceState: string} icestatechange
     * @emits {iceSelectedTuple: TransportTuple} iceselectedtuplechange
     * @emits {dtlsState: DtlsState} dtlsstatechange
     * @emits {sctpState: SctpState} sctpstatechange
     * @emits {TransportPacketEventData} packet
     */
    constructor(params) {
        super(params);
        logger.debug('constructor()');
        const { data } = params;
        this._data =
            {
                iceRole: data.iceRole,
                iceParameters: data.iceParameters,
                iceCandidates: data.iceCandidates,
                iceState: data.iceState,
                iceSelectedTuple: data.iceSelectedTuple,
                dtlsParameters: data.dtlsParameters,
                dtlsState: data.dtlsState,
                dtlsRemoteCert: data.dtlsRemoteCert,
                sctpParameters: data.sctpParameters,
                sctpState: data.sctpState
            };
        this._handleWorkerNotifications();
    }
    /**
     * ICE role.
     */
    get iceRole() {
        return this._data.iceRole;
    }
    /**
     * ICE parameters.
     */
    get iceParameters() {
        return this._data.iceParameters;
    }
    /**
     * ICE candidates.
     */
    get iceCandidates() {
        return this._data.iceCandidates;
    }
    /**
     * ICE state.
     */
    get iceState() {
        return this._data.iceState;
    }
    /**
     * ICE selected tuple.
     */
    get iceSelectedTuple() {
        return this._data.iceSelectedTuple;
    }
    /**
     * DTLS parameters.
     */
    get dtlsParameters() {
        return this._data.dtlsParameters;
    }
    /**
     * DTLS state.
     */
    get dtlsState() {
        return this._data.dtlsState;
    }
    /**
     * Remote certificate in PEM format.
     */
    get dtlsRemoteCert() {
        return this._data.dtlsRemoteCert;
    }
    /**
     * SCTP parameters.
     */
    get sctpParameters() {
        return this._data.sctpParameters;
    }
    /**
     * SCTP state.
     */
    get sctpState() {
        return this._data.sctpState;
    }
    /**
     * Observer.
     *
     * @override
     * @emits close
     * @emits {producer: Producer} newproducer
     * @emits {consumer: Consumer} newconsumer
     * @emits {producer: DataProducer} newdataproducer
     * @emits {consumer: DataConsumer} newdataconsumer
     * @emits {iceState: IceState} icestatechange
     * @emits {iceSelectedTuple: TransportTuple} iceselectedtuplechange
     * @emits {dtlsState: DtlsState} dtlsstatechange
     * @emits {sctpState: SctpState} sctpstatechange
     * @emits {TransportPacketEventData} packet
     */
    get observer() {
        return this._observer;
    }
    /**
     * Close the WebRtcTransport.
     *
     * @override
     */
    close() {
        if (this._closed)
            return;
        this._data.iceState = 'closed';
        this._data.iceSelectedTuple = undefined;
        this._data.dtlsState = 'closed';
        if (this._data.sctpState)
            this._data.sctpState = 'closed';
        super.close();
    }
    /**
     * Router was closed.
     *
     * @private
     * @override
     */
    routerClosed() {
        if (this._closed)
            return;
        this._data.iceState = 'closed';
        this._data.iceSelectedTuple = undefined;
        this._data.dtlsState = 'closed';
        if (this._data.sctpState)
            this._data.sctpState = 'closed';
        super.routerClosed();
    }
    /**
     * Get WebRtcTransport stats.
     *
     * @override
     */
    getStats() {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('getStats()');
            return this._channel.request('transport.getStats', this._internal);
        });
    }
    /**
     * Provide the WebRtcTransport remote parameters.
     *
     * @override
     */
    connect({ dtlsParameters }) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('connect()');
            const reqData = { dtlsParameters };
            const data = yield this._channel.request('transport.connect', this._internal, reqData);
            // Update data.
            this._data.dtlsParameters.role = data.dtlsLocalRole;
        });
    }
    /**
     * Restart ICE.
     */
    restartIce() {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('restartIce()');
            const data = yield this._channel.request('transport.restartIce', this._internal);
            const { iceParameters } = data;
            this._data.iceParameters = iceParameters;
            return iceParameters;
        });
    }
    _handleWorkerNotifications() {
        this._channel.on(this._internal.transportId, (event, data) => {
            switch (event) {
                case 'icestatechange':
                    {
                        const iceState = data.iceState;
                        this._data.iceState = iceState;
                        this.safeEmit('icestatechange', iceState);
                        // Emit observer event.
                        this._observer.safeEmit('icestatechange', iceState);
                        break;
                    }
                case 'iceselectedtuplechange':
                    {
                        const iceSelectedTuple = data.iceSelectedTuple;
                        this._data.iceSelectedTuple = iceSelectedTuple;
                        this.safeEmit('iceselectedtuplechange', iceSelectedTuple);
                        // Emit observer event.
                        this._observer.safeEmit('iceselectedtuplechange', iceSelectedTuple);
                        break;
                    }
                case 'dtlsstatechange':
                    {
                        const dtlsState = data.dtlsState;
                        const dtlsRemoteCert = data.dtlsRemoteCert;
                        this._data.dtlsState = dtlsState;
                        if (dtlsState === 'connected')
                            this._data.dtlsRemoteCert = dtlsRemoteCert;
                        this.safeEmit('dtlsstatechange', dtlsState);
                        // Emit observer event.
                        this._observer.safeEmit('dtlsstatechange', dtlsState);
                        break;
                    }
                case 'sctpstatechange':
                    {
                        const sctpState = data.sctpState;
                        this._data.sctpState = sctpState;
                        this.safeEmit('sctpstatechange', sctpState);
                        // Emit observer event.
                        this._observer.safeEmit('sctpstatechange', sctpState);
                        break;
                    }
                case 'packet':
                    {
                        const packet = data;
                        this.safeEmit('packet', packet);
                        // Emit observer event.
                        this._observer.safeEmit('packet', packet);
                        break;
                    }
                default:
                    {
                        logger.error('ignoring unknown event "%s"', event);
                    }
            }
        });
    }
}
exports.default = WebRtcTransport;
