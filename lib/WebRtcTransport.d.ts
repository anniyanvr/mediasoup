import EnhancedEventEmitter from './EnhancedEventEmitter';
import Transport, { TransportListenIp, TransportProtocol, TransportTuple, SctpState } from './Transport';
import { SctpParameters, NumSctpStreams } from './SctpParameters';
export interface WebRtcTransportOptions {
    /**
     * Listening IP address or addresses in order of preference (first one is the
     * preferred one).
     */
    listenIps: TransportListenIp[] | string[];
    /**
     * Listen in UDP. Default true.
     */
    enableUdp?: boolean;
    /**
     * Listen in TCP. Default false.
     */
    enableTcp?: boolean;
    /**
     * Prefer UDP. Default false.
     */
    preferUdp?: boolean;
    /**
     * Prefer TCP. Default false.
     */
    preferTcp?: boolean;
    /**
     * Initial available outgoing bitrate (in bps). Default 600000.
     */
    initialAvailableOutgoingBitrate?: number;
    /**
     * Create a SCTP association. Default false.
     */
    enableSctp?: boolean;
    /**
     * SCTP streams number.
     */
    numSctpStreams?: NumSctpStreams;
    /**
     * Maximum size of data that can be passed to DataProducer's send() method.
     * Default 262144.
     */
    maxSctpMessageSize?: number;
    /**
     * Custom application data.
     */
    appData?: any;
}
export interface IceParameters {
    usernameFragment: string;
    password: string;
    iceLite?: boolean;
}
export interface IceCandidate {
    foundation: string;
    priority: number;
    ip: string;
    protocol: TransportProtocol;
    port: number;
    type: 'host';
    tcpType: 'passive' | undefined;
}
export interface DtlsParameters {
    role?: DtlsRole;
    fingerprints: DtlsFingerprint[];
}
/**
 * The hash function algorithm (as defined in the "Hash function Textual Names"
 * registry initially specified in RFC 4572 Section 8) and its corresponding
 * certificate fingerprint value (in lowercase hex string as expressed utilizing
 * the syntax of "fingerprint" in RFC 4572 Section 5).
 */
export interface DtlsFingerprint {
    algorithm: string;
    value: string;
}
export declare type IceState = 'new' | 'connected' | 'completed' | 'disconnected' | 'closed';
export declare type DtlsRole = 'auto' | 'client' | 'server';
export declare type DtlsState = 'new' | 'connecting' | 'connected' | 'failed' | 'closed';
export interface WebRtcTransportStat {
    type: string;
    transportId: string;
    timestamp: number;
    sctpState?: SctpState;
    bytesReceived: number;
    recvBitrate: number;
    bytesSent: number;
    sendBitrate: number;
    rtpBytesReceived: number;
    rtpRecvBitrate: number;
    rtpBytesSent: number;
    rtpSendBitrate: number;
    rtxBytesReceived: number;
    rtxRecvBitrate: number;
    rtxBytesSent: number;
    rtxSendBitrate: number;
    probationBytesReceived: number;
    probationRecvBitrate: number;
    probationBytesSent: number;
    probationSendBitrate: number;
    availableOutgoingBitrate?: number;
    availableIncomingBitrate?: number;
    maxIncomingBitrate?: number;
    iceRole: string;
    iceState: IceState;
    iceSelectedTuple?: TransportTuple;
    dtlsState: DtlsState;
}
export default class WebRtcTransport extends Transport {
    /**
     * @private
     * @emits {iceState: string} icestatechange
     * @emits {iceSelectedTuple: TransportTuple} iceselectedtuplechange
     * @emits {dtlsState: DtlsState} dtlsstatechange
     * @emits {sctpState: SctpState} sctpstatechange
     * @emits {TransportPacketEventData} packet
     */
    constructor(params: any);
    /**
     * ICE role.
     */
    get iceRole(): 'controlled';
    /**
     * ICE parameters.
     */
    get iceParameters(): IceParameters;
    /**
     * ICE candidates.
     */
    get iceCandidates(): IceCandidate[];
    /**
     * ICE state.
     */
    get iceState(): IceState;
    /**
     * ICE selected tuple.
     */
    get iceSelectedTuple(): TransportTuple | undefined;
    /**
     * DTLS parameters.
     */
    get dtlsParameters(): DtlsParameters;
    /**
     * DTLS state.
     */
    get dtlsState(): DtlsState;
    /**
     * Remote certificate in PEM format.
     */
    get dtlsRemoteCert(): string | undefined;
    /**
     * SCTP parameters.
     */
    get sctpParameters(): SctpParameters | undefined;
    /**
     * SCTP state.
     */
    get sctpState(): SctpState;
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
    get observer(): EnhancedEventEmitter;
    /**
     * Close the WebRtcTransport.
     *
     * @override
     */
    close(): void;
    /**
     * Router was closed.
     *
     * @private
     * @override
     */
    routerClosed(): void;
    /**
     * Get WebRtcTransport stats.
     *
     * @override
     */
    getStats(): Promise<WebRtcTransportStat[]>;
    /**
     * Provide the WebRtcTransport remote parameters.
     *
     * @override
     */
    connect({ dtlsParameters }: {
        dtlsParameters: DtlsParameters;
    }): Promise<void>;
    /**
     * Restart ICE.
     */
    restartIce(): Promise<IceParameters>;
    private _handleWorkerNotifications;
}
//# sourceMappingURL=WebRtcTransport.d.ts.map