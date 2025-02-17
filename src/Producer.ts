import Logger from './Logger';
import EnhancedEventEmitter from './EnhancedEventEmitter';
import Channel from './Channel';
import { MediaKind, RtpParameters } from './RtpParameters';

export interface ProducerOptions
{
	/**
	 * Producer id (just for Router.pipeToRouter() method).
	 */
	id?: string;

	/**
	 * Media kind ('audio' or 'video').
	 */
	kind: MediaKind;

	/**
	 * RTP parameters defining what the endpoint is sending.
	 */
	rtpParameters: RtpParameters;

	/**
	 * Whether the producer must start in paused mode. Default false.
	 */
	paused?: boolean;

	/**
	 * Custom application data.
	 */
	appData?: any;
}

/**
 * Valid types for 'packet' event.
 */
export type ProducerPacketEventType = 'rtp' | 'nack' | 'pli' | 'fir';

/**
 * 'packet' event data.
 */
export interface ProducerPacketEventData
{
	/**
	 * Type of packet.
	 */
	type: ProducerPacketEventType;

	/**
	 * Event timestamp.
	 */
	timestamp: number;

	/**
	 * Event direction.
	 */
	direction: 'in' | 'out';

	/**
	 * Per type information.
	 */
	info: any;
}

export interface ProducerScore
{
	/**
	 * SSRC of the RTP stream.
	 */
	ssrc: number;

	/**
	 * RID of the RTP stream.
	 */
	rid?: string;

	/**
	 * The score of the RTP stream.
	 */
	score: number;
}

export interface ProducerVideoOrientation
{
	/**
	 * Whether the source is a video camera.
	 */
	camera: boolean;

	/**
	 * Whether the video source is flipped.
	 */
	flip: boolean;

	/**
	 * Rotation degrees (0, 90, 180 or 270).
	 */
	rotation: number;
}

export interface ProducerStat
{
	// Common to all RtpStreams.
	type: string;
	timestamp: number;
	ssrc: number;
	rtxSsrc?: number;
	rid?: string;
	kind: string;
	mimeType: string;
	packetsLost: number;
	fractionLost: number;
	packetsDiscarded: number;
	packetsRetransmitted: number;
	packetsRepaired: number;
	nackCount: number;
	nackPacketCount: number;
	pliCount: number;
	firCount: number;
	score: number;
	packetCount: number;
	byteCount: number;
	bitrate: number;
	roundTripTime?: number;

	// RtpStreamRecv specific.
	jitter: number;
	bitrateByLayer?: any;
}

/**
 * Producer type.
 */
export type ProducerType = 'simple' | 'simulcast' | 'svc';

const logger = new Logger('Producer');

export default class Producer extends EnhancedEventEmitter
{
	// Internal data.
	// - .routerId
	// - .transportId
	// - .producerId
	private readonly _internal: any;

	// Producer data.
	// - .kind
	// - .rtpParameters
	// - .type
	// - .consumableRtpParameters
	private readonly _data: any;

	// Channel instance.
	private readonly _channel: Channel;

	// Closed flag.
	private _closed = false;

	// Custom app data.
	private readonly _appData?: any;

	// Paused flag.
	private _paused = false;

	// Current score.
	private _score: ProducerScore[] = [];

	// Observer instance.
	private readonly _observer = new EnhancedEventEmitter();

	/**
	 * @private
	 * @emits transportclose
	 * @emits {ProducerScore[]} score
	 * @emits {ProducerVideoOrientation} videoorientationchange
	 * @emits {ProducerPacketEventData} packet
	 * @emits @close
	 */
	constructor(
		{
			internal,
			data,
			channel,
			appData,
			paused
		}:
		{
			internal: any;
			data: any;
			channel: Channel;
			appData?: any;
			paused: boolean;
		}
	)
	{
		super(logger);

		logger.debug('constructor()');

		this._internal = internal;
		this._data = data;
		this._channel = channel;
		this._appData = appData;
		this._paused = paused;

		this._handleWorkerNotifications();
	}

	/**
	 * Producer id.
	 */
	get id(): string
	{
		return this._internal.producerId;
	}

	/**
	 * Whether the Producer is closed.
	 */
	get closed(): boolean
	{
		return this._closed;
	}

	/**
	 * Media kind.
	 */
	get kind(): MediaKind
	{
		return this._data.kind;
	}

	/**
	 * RTP parameters.
	 */
	get rtpParameters(): RtpParameters
	{
		return this._data.rtpParameters;
	}

	/**
	 * Producer type.
	 */
	get type(): ProducerType
	{
		return this._data.type;
	}

	/**
	 * Consumable RTP parameters.
	 *
	 * @private
	 */
	get consumableRtpParameters(): RtpParameters
	{
		return this._data.consumableRtpParameters;
	}

	/**
	 * Whether the Producer is paused.
	 */
	get paused(): boolean
	{
		return this._paused;
	}

	/**
	 * Producer score list.
	 */
	get score(): ProducerScore[]
	{
		return this._score;
	}

	/**
	 * App custom data.
	 */
	get appData(): any
	{
		return this._appData;
	}

	/**
	 * Invalid setter.
	 */
	set appData(appData: any) // eslint-disable-line no-unused-vars
	{
		throw new Error('cannot override appData object');
	}

	/**
	 * Observer.
	 *
	 * @emits close
	 * @emits pause
	 * @emits resume
	 * @emits {ProducerScore[]} score
	 * @emits {ProducerVideoOrientation} videoorientationchange
	 * @emits {ProducerPacketEventData} packet
	 */
	get observer(): EnhancedEventEmitter
	{
		return this._observer;
	}

	/**
	 * Close the Producer.
	 */
	close(): void
	{
		if (this._closed)
			return;

		logger.debug('close()');

		this._closed = true;

		// Remove notification subscriptions.
		this._channel.removeAllListeners(this._internal.producerId);

		this._channel.request('producer.close', this._internal)
			.catch(() => {});

		this.emit('@close');

		// Emit observer event.
		this._observer.safeEmit('close');
	}

	/**
	 * Transport was closed.
	 *
	 * @private
	 */
	transportClosed(): void
	{
		if (this._closed)
			return;

		logger.debug('transportClosed()');

		this._closed = true;

		// Remove notification subscriptions.
		this._channel.removeAllListeners(this._internal.producerId);

		this.safeEmit('transportclose');

		// Emit observer event.
		this._observer.safeEmit('close');
	}

	/**
	 * Dump Producer.
	 */
	async dump(): Promise<any>
	{
		logger.debug('dump()');

		return this._channel.request('producer.dump', this._internal);
	}

	/**
	 * Get Producer stats.
	 */
	async getStats(): Promise<ProducerStat[]>
	{
		logger.debug('getStats()');

		return this._channel.request('producer.getStats', this._internal);
	}

	/**
	 * Pause the Producer.
	 */
	async pause(): Promise<void>
	{
		logger.debug('pause()');

		const wasPaused = this._paused;

		await this._channel.request('producer.pause', this._internal);

		this._paused = true;

		// Emit observer event.
		if (!wasPaused)
			this._observer.safeEmit('pause');
	}

	/**
	 * Resume the Producer.
	 */
	async resume(): Promise<void>
	{
		logger.debug('resume()');

		const wasPaused = this._paused;

		await this._channel.request('producer.resume', this._internal);

		this._paused = false;

		// Emit observer event.
		if (wasPaused)
			this._observer.safeEmit('resume');
	}

	/**
	 * Enable 'packet' event.
	 */
	async enablePacketEvent(types: ProducerPacketEventType[] = []): Promise<void>
	{
		logger.debug('enablePacketEvent()');

		const reqData = { types };

		await this._channel.request(
			'producer.enablePacketEvent', this._internal, reqData);
	}

	private _handleWorkerNotifications(): void
	{
		this._channel.on(this._internal.producerId, (event: string, data?: any) =>
		{
			switch (event)
			{
				case 'score':
				{
					const score = data as ProducerScore[];

					this._score = score;

					this.safeEmit('score', score);

					// Emit observer event.
					this._observer.safeEmit('score', score);

					break;
				}

				case 'videoorientationchange':
				{
					const videoOrientation = data as ProducerVideoOrientation;

					this.safeEmit('videoorientationchange', videoOrientation);

					// Emit observer event.
					this._observer.safeEmit('videoorientationchange', videoOrientation);

					break;
				}

				case 'packet':
				{
					const packet = data as ProducerPacketEventData;

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
