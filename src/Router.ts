import uuidv4 from 'uuid/v4';
import Logger from './Logger';
import EnhancedEventEmitter from './EnhancedEventEmitter';
import * as ortc from './ortc';
import Channel from './Channel';
import Transport, { TransportListenIp } from './Transport';
import WebRtcTransport, { WebRtcTransportOptions } from './WebRtcTransport';
import PlainRtpTransport, { PlainRtpTransportOptions } from './PlainRtpTransport';
import PipeTransport, { PipeTransportOptions } from './PipeTransport';
import Producer from './Producer';
import Consumer from './Consumer';
import DataProducer from './DataProducer';
import DataConsumer from './DataConsumer';
import RtpObserver from './RtpObserver';
import AudioLevelObserver, { AudioLevelObserverOptions } from './AudioLevelObserver';
import { RtpCapabilities, RtpCodecCapability } from './RtpParameters';
import { NumSctpStreams } from './SctpParameters';

export interface RouterOptions
{
	/**
	 * Router media codecs.
	 */
	mediaCodecs?: RtpCodecCapability[];

	/**
	 * Custom application data.
	 */
	appData?: any;
}

export interface PipeToRouterOptions
{
	/**
	 * The id of the Producer to consume.
	 */
	producerId?: string;

	/**
	 * The id of the DataProducer to consume.
	 */
	dataProducerId?: string;

	/**
	 * Target Router instance.
	 */
	router: Router;

	/**
	 * IP used in the PipeTransport pair. Default '127.0.0.1'.
	 */
	listenIp?: TransportListenIp | string;

	/**
	 * Create a SCTP association. Default false.
	 */
	enableSctp?: boolean;

	/**
	 * SCTP streams number.
	 */
	numSctpStreams?: NumSctpStreams;
}

export interface PipeToRouterResult
{
	/**
	 * The Consumer created in the current Router.
	 */
	pipeConsumer?: Consumer;

	/**
	 * The Producer created in the target Router.
	 */
	pipeProducer?: Producer;

	/**
	 * The DataConsumer created in the current Router.
	 */
	pipeDataConsumer?: DataConsumer;

	/**
	 * The DataProducer created in the target Router.
	 */
	pipeDataProducer?: DataProducer;
}

const logger = new Logger('Router');

export default class Router extends EnhancedEventEmitter
{
	// Internal data.
	// - .routerId
	private readonly _internal: any;

	// Router data.
	// - .rtpCapabilities
	private readonly _data: any;

	// Channel instance.
	private readonly _channel: Channel;

	// Closed flag.
	private _closed = false;

	// Custom app data.
	private readonly _appData?: any;

	// Transports map.
	private readonly _transports: Map<string, Transport> = new Map();

	// Producers map.
	private readonly _producers: Map<string, Producer> = new Map();

	// RtpObservers map.
	private readonly _rtpObservers: Map<string, RtpObserver> = new Map();

	// DataProducers map.
	private readonly _dataProducers: Map<string, DataProducer> = new Map();

	// Router to PipeTransport map.
	private readonly _mapRouterPipeTransports: Map<Router, PipeTransport[]> = new Map();

	// Observer instance.
	private readonly _observer = new EnhancedEventEmitter();

	/**
	 * @private
	 * @emits workerclose
	 * @emits @close
	 */
	constructor(
		{
			internal,
			data,
			channel,
			appData
		}:
		{
			internal: any;
			data: any;
			channel: Channel;
			appData?: any;
		}
	)
	{
		super(logger);

		logger.debug('constructor()');

		this._internal = internal;
		this._data = data;
		this._channel = channel;
		this._appData = appData;
	}

	/**
	 * Router id.
	 */
	get id(): string
	{
		return this._internal.routerId;
	}

	/**
	 * Whether the Router is closed.
	 */
	get closed(): boolean
	{
		return this._closed;
	}

	/**
	 * RTC capabilities of the Router.
	 */
	get rtpCapabilities(): RtpCapabilities
	{
		return this._data.rtpCapabilities;
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
	 * @emits {transport: Transport} newtransport
	 * @emits {rtpObserver: RtpObserver} newrtpobserver
	 */
	get observer(): EnhancedEventEmitter
	{
		return this._observer;
	}

	/**
	 * Close the Router.
	 */
	close(): void
	{
		if (this._closed)
			return;

		logger.debug('close()');

		this._closed = true;

		this._channel.request('router.close', this._internal)
			.catch(() => {});

		// Close every Transport.
		for (const transport of this._transports.values())
		{
			transport.routerClosed();
		}
		this._transports.clear();

		// Clear the Producers map.
		this._producers.clear();

		// Close every RtpObserver.
		for (const rtpObserver of this._rtpObservers.values())
		{
			rtpObserver.routerClosed();
		}
		this._rtpObservers.clear();

		// Clear the DataProducers map.
		this._dataProducers.clear();

		// Clear map of Router/PipeTransports.
		this._mapRouterPipeTransports.clear();

		this.emit('@close');

		// Emit observer event.
		this._observer.safeEmit('close');
	}

	/**
	 * Worker was closed.
	 *
	 * @private
	 */
	workerClosed(): void
	{
		if (this._closed)
			return;

		logger.debug('workerClosed()');

		this._closed = true;

		// Close every Transport.
		for (const transport of this._transports.values())
		{
			transport.routerClosed();
		}
		this._transports.clear();

		// Clear the Producers map.
		this._producers.clear();

		// Close every RtpObserver.
		for (const rtpObserver of this._rtpObservers.values())
		{
			rtpObserver.routerClosed();
		}
		this._rtpObservers.clear();

		// Clear the DataProducers map.
		this._dataProducers.clear();

		// Clear map of Router/PipeTransports.
		this._mapRouterPipeTransports.clear();

		this.safeEmit('workerclose');

		// Emit observer event.
		this._observer.safeEmit('close');
	}

	/**
	 * Dump Router.
	 */
	async dump(): Promise<any>
	{
		logger.debug('dump()');

		return this._channel.request('router.dump', this._internal);
	}

	/**
	 * Create a WebRtcTransport.
	 */
	async createWebRtcTransport(
		{
			listenIps,
			enableUdp = true,
			enableTcp = false,
			preferUdp = false,
			preferTcp = false,
			initialAvailableOutgoingBitrate = 600000,
			enableSctp = false,
			numSctpStreams = { OS: 1024, MIS: 1024 },
			maxSctpMessageSize = 262144,
			appData = {}
		}: WebRtcTransportOptions
	): Promise<WebRtcTransport>
	{
		logger.debug('createWebRtcTransport()');

		if (!Array.isArray(listenIps))
			throw new TypeError('missing listenIps');
		else if (appData && typeof appData !== 'object')
			throw new TypeError('if given, appData must be an object');

		listenIps = (listenIps as any[]).map((listenIp: TransportListenIp | string) =>
		{
			if (typeof listenIp === 'string' && listenIp)
			{
				return { ip: listenIp };
			}
			else if (typeof listenIp === 'object')
			{
				return {
					ip          : listenIp.ip,
					announcedIp : listenIp.announcedIp || undefined
				};
			}
			else
			{
				throw new TypeError('wrong listenIp');
			}
		});

		const internal = { ...this._internal, transportId: uuidv4() };
		const reqData = {
			listenIps,
			enableUdp,
			enableTcp,
			preferUdp,
			preferTcp,
			initialAvailableOutgoingBitrate,
			enableSctp,
			numSctpStreams,
			maxSctpMessageSize,
			isDataChannel : true
		};

		const data =
			await this._channel.request('router.createWebRtcTransport', internal, reqData);

		const transport = new WebRtcTransport(
			{
				internal,
				data,
				channel                  : this._channel,
				appData,
				getRouterRtpCapabilities : (): RtpCapabilities => this._data.rtpCapabilities,
				getProducerById          : (producerId: string): Producer => (
					this._producers.get(producerId)
				),
				getDataProducerById : (dataProducerId: string): DataProducer => (
					this._dataProducers.get(dataProducerId)
				)
			});

		this._transports.set(transport.id, transport);
		transport.on('@close', () => this._transports.delete(transport.id));
		transport.on('@newproducer', (producer: Producer) => this._producers.set(producer.id, producer));
		transport.on('@producerclose', (producer: Producer) => this._producers.delete(producer.id));
		transport.on('@newdataproducer', (dataProducer: DataProducer) => (
			this._dataProducers.set(dataProducer.id, dataProducer)
		));
		transport.on('@dataproducerclose', (dataProducer: DataProducer) => (
			this._dataProducers.delete(dataProducer.id)
		));

		// Emit observer event.
		this._observer.safeEmit('newtransport', transport);

		return transport;
	}

	/**
	 * Create a PlainRtpTransport.
	 */
	async createPlainRtpTransport(
		{
			listenIp,
			rtcpMux = true,
			comedia = false,
			multiSource = false,
			enableSctp = false,
			numSctpStreams = { OS: 1024, MIS: 1024 },
			maxSctpMessageSize = 262144,
			appData = {}
		}: PlainRtpTransportOptions
	): Promise<PlainRtpTransport>
	{
		logger.debug('createPlainRtpTransport()');

		if (!listenIp)
			throw new TypeError('missing listenIp');
		else if (appData && typeof appData !== 'object')
			throw new TypeError('if given, appData must be an object');

		if (typeof listenIp === 'string' && listenIp)
		{
			listenIp = { ip: listenIp };
		}
		else if (typeof listenIp === 'object')
		{
			listenIp =
			{
				ip          : listenIp.ip,
				announcedIp : listenIp.announcedIp || undefined
			};
		}
		else
		{
			throw new TypeError('wrong listenIp');
		}

		const internal = { ...this._internal, transportId: uuidv4() };
		const reqData = {
			listenIp,
			rtcpMux,
			comedia,
			multiSource,
			enableSctp,
			numSctpStreams,
			maxSctpMessageSize,
			isDataChannel : false
		};

		const data =
			await this._channel.request('router.createPlainRtpTransport', internal, reqData);

		const transport = new PlainRtpTransport(
			{
				internal,
				data,
				channel                  : this._channel,
				appData,
				getRouterRtpCapabilities : (): RtpCapabilities => this._data.rtpCapabilities,
				getProducerById          : (producerId: string): Producer => (
					this._producers.get(producerId)
				),
				getDataProducerById : (dataProducerId: string): DataProducer => (
					this._dataProducers.get(dataProducerId)
				)
			});

		this._transports.set(transport.id, transport);
		transport.on('@close', () => this._transports.delete(transport.id));
		transport.on('@newproducer', (producer: Producer) => this._producers.set(producer.id, producer));
		transport.on('@producerclose', (producer: Producer) => this._producers.delete(producer.id));
		transport.on('@newdataproducer', (dataProducer: DataProducer) => (
			this._dataProducers.set(dataProducer.id, dataProducer)
		));
		transport.on('@dataproducerclose', (dataProducer: DataProducer) => (
			this._dataProducers.delete(dataProducer.id)
		));

		// Emit observer event.
		this._observer.safeEmit('newtransport', transport);

		return transport;
	}

	/**
	 * Create a PipeTransport.
	 */
	async createPipeTransport(
		{
			listenIp,
			enableSctp = false,
			numSctpStreams = { OS: 1024, MIS: 1024 },
			maxSctpMessageSize = 1073741823,
			appData = {}
		}: PipeTransportOptions
	): Promise<PipeTransport>
	{
		logger.debug('createPipeTransport()');

		if (!listenIp)
			throw new TypeError('missing listenIp');
		else if (appData && typeof appData !== 'object')
			throw new TypeError('if given, appData must be an object');

		if (typeof listenIp === 'string' && listenIp)
		{
			listenIp = { ip: listenIp };
		}
		else if (typeof listenIp === 'object')
		{
			listenIp =
			{
				ip          : listenIp.ip,
				announcedIp : listenIp.announcedIp || undefined
			};
		}
		else
		{
			throw new TypeError('wrong listenIp');
		}

		const internal = { ...this._internal, transportId: uuidv4() };
		const reqData = {
			listenIp,
			enableSctp,
			numSctpStreams,
			maxSctpMessageSize,
			isDataChannel : false
		};

		const data =
			await this._channel.request('router.createPipeTransport', internal, reqData);

		const transport = new PipeTransport(
			{
				internal,
				data,
				channel                  : this._channel,
				appData,
				getRouterRtpCapabilities : (): RtpCapabilities => this._data.rtpCapabilities,
				getProducerById          : (producerId: string): Producer => (
					this._producers.get(producerId)
				),
				getDataProducerById : (dataProducerId: string): DataProducer => (
					this._dataProducers.get(dataProducerId)
				)
			});

		this._transports.set(transport.id, transport);
		transport.on('@close', () => this._transports.delete(transport.id));
		transport.on('@newproducer', (producer: Producer) => this._producers.set(producer.id, producer));
		transport.on('@producerclose', (producer: Producer) => this._producers.delete(producer.id));
		transport.on('@newdataproducer', (dataProducer: DataProducer) => (
			this._dataProducers.set(dataProducer.id, dataProducer)
		));
		transport.on('@dataproducerclose', (dataProducer: DataProducer) => (
			this._dataProducers.delete(dataProducer.id)
		));

		// Emit observer event.
		this._observer.safeEmit('newtransport', transport);

		return transport;
	}

	/**
	 * Pipes the given Producer or DataProducer into another Router in same host.
	 */
	async pipeToRouter(
		{
			producerId,
			dataProducerId,
			router,
			listenIp = '127.0.0.1',
			enableSctp = true,
			numSctpStreams = { OS: 1024, MIS: 1024 }
		}: PipeToRouterOptions
	): Promise<PipeToRouterResult>
	{
		if (!producerId && !dataProducerId)
			throw new TypeError('missing producerId or dataProducerId');
		else if (producerId && dataProducerId)
			throw new TypeError('just producerId or dataProducerId can be given');
		else if (!router)
			throw new TypeError('Router not found');
		else if (router === this)
			throw new TypeError('cannot use this Router as destination');

		let producer: Producer;
		let dataProducer: DataProducer;

		if (producerId)
		{
			producer = this._producers.get(producerId);

			if (!producer)
				throw new TypeError('Producer not found');
		}
		else if (dataProducerId)
		{
			dataProducer = this._dataProducers.get(dataProducerId);

			if (!dataProducer)
				throw new TypeError('DataProducer not found');
		}

		let pipeTransportPair = this._mapRouterPipeTransports.get(router);
		let localPipeTransport: PipeTransport;
		let remotePipeTransport: PipeTransport;

		if (pipeTransportPair)
		{
			localPipeTransport = pipeTransportPair[0];
			remotePipeTransport = pipeTransportPair[1];
		}
		else
		{
			try
			{
				pipeTransportPair = await Promise.all(
					[
						this.createPipeTransport({ listenIp, enableSctp, numSctpStreams }),
						router.createPipeTransport({ listenIp, enableSctp, numSctpStreams })
					]);

				localPipeTransport = pipeTransportPair[0];
				remotePipeTransport = pipeTransportPair[1];

				await Promise.all(
					[
						localPipeTransport.connect(
							{
								ip   : remotePipeTransport.tuple.localIp,
								port : remotePipeTransport.tuple.localPort
							}),
						remotePipeTransport.connect(
							{
								ip   : localPipeTransport.tuple.localIp,
								port : localPipeTransport.tuple.localPort
							})
					]);

				localPipeTransport.observer.on('close', () =>
				{
					remotePipeTransport.close();
					this._mapRouterPipeTransports.delete(router);
				});

				remotePipeTransport.observer.on('close', () =>
				{
					localPipeTransport.close();
					this._mapRouterPipeTransports.delete(router);
				});

				this._mapRouterPipeTransports.set(
					router, [ localPipeTransport, remotePipeTransport ]);
			}
			catch (error)
			{
				logger.error(
					'pipeToRouter() | error creating PipeTransport pair:%o',
					error);

				if (localPipeTransport)
					localPipeTransport.close();

				if (remotePipeTransport)
					remotePipeTransport.close();

				throw error;
			}
		}

		if (producer)
		{
			let pipeConsumer: Consumer;
			let pipeProducer: Producer;

			try
			{
				pipeConsumer = await localPipeTransport.consume({ producerId });

				pipeProducer = await remotePipeTransport.produce(
					{
						id            : producer.id,
						kind          : pipeConsumer.kind,
						rtpParameters : pipeConsumer.rtpParameters,
						paused        : pipeConsumer.producerPaused,
						appData       : producer.appData
					});

				// Pipe events from the pipe Consumer to the pipe Producer.
				pipeConsumer.observer.on('close', () => pipeProducer.close());
				pipeConsumer.observer.on('pause', () => pipeProducer.pause());
				pipeConsumer.observer.on('resume', () => pipeProducer.resume());

				// Pipe events from the pipe Producer to the pipe Consumer.
				pipeProducer.observer.on('close', () => pipeConsumer.close());

				return { pipeConsumer, pipeProducer };
			}
			catch (error)
			{
				logger.error(
					'pipeToRouter() | error creating pipe Consumer/Producer pair:%o',
					error);

				if (pipeConsumer)
					pipeConsumer.close();

				if (pipeProducer)
					pipeProducer.close();

				throw error;
			}
		}
		else if (dataProducer)
		{
			let pipeDataConsumer: DataConsumer;
			let pipeDataProducer: DataProducer;

			try
			{
				pipeDataConsumer = await localPipeTransport.consumeData(
					{
						dataProducerId
					});

				pipeDataProducer = await remotePipeTransport.produceData(
					{
						id                   : dataProducer.id,
						sctpStreamParameters : pipeDataConsumer.sctpStreamParameters,
						label                : pipeDataConsumer.label,
						protocol             : pipeDataConsumer.protocol,
						appData              : dataProducer.appData
					});

				// Pipe events from the pipe DataConsumer to the pipe DataProducer.
				pipeDataConsumer.observer.on('close', () => pipeDataProducer.close());

				// Pipe events from the pipe DataProducer to the pipe DataConsumer.
				pipeDataProducer.observer.on('close', () => pipeDataConsumer.close());

				return { pipeDataConsumer, pipeDataProducer };
			}
			catch (error)
			{
				logger.error(
					'pipeToRouter() | error creating pipe DataConsumer/DataProducer pair:%o',
					error);

				if (pipeDataConsumer)
					pipeDataConsumer.close();

				if (pipeDataProducer)
					pipeDataProducer.close();

				throw error;
			}
		}
		else
		{
			throw new Error('internal error');
		}
	}

	/**
	 * Create an AudioLevelObserver.
	 */
	async createAudioLevelObserver(
		{
			maxEntries = 1,
			threshold = -80,
			interval = 1000,
			appData = {}
		}: AudioLevelObserverOptions = {}
	): Promise<AudioLevelObserver>
	{
		logger.debug('createAudioLevelObserver()');

		if (appData && typeof appData !== 'object')
			throw new TypeError('if given, appData must be an object');

		const internal = { ...this._internal, rtpObserverId: uuidv4() };
		const reqData = { maxEntries, threshold, interval };

		await this._channel.request('router.createAudioLevelObserver', internal, reqData);

		const audioLevelObserver = new AudioLevelObserver(
			{
				internal,
				channel         : this._channel,
				appData,
				getProducerById : (producerId: string): Producer => (
					this._producers.get(producerId)
				)
			});

		this._rtpObservers.set(audioLevelObserver.id, audioLevelObserver);
		audioLevelObserver.on('@close', () =>
		{
			this._rtpObservers.delete(audioLevelObserver.id);
		});

		// Emit observer event.
		this._observer.safeEmit('newrtpobserver', audioLevelObserver);

		return audioLevelObserver;
	}

	/**
	 * Check whether the given RTP capabilities can consume the given Producer.
	 */
	canConsume(
		{
			producerId,
			rtpCapabilities
		}:
		{
			producerId: string;
			rtpCapabilities: RtpCapabilities;
		}
	): boolean
	{
		const producer = this._producers.get(producerId);

		if (!producer)
		{
			logger.error(
				'canConsume() | Producer with id "%s" not found', producerId);

			return false;
		}

		try
		{
			return ortc.canConsume(producer.consumableRtpParameters, rtpCapabilities);
		}
		catch (error)
		{
			logger.error('canConsume() | unexpected error: %s', String(error));

			return false;
		}
	}
}
