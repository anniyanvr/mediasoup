#ifndef MS_RTC_TRANSPORT_CONGESTION_CONTROL_CLIENT_HPP
#define MS_RTC_TRANSPORT_CONGESTION_CONTROL_CLIENT_HPP

#include "common.hpp"
#include "RTC/BweType.hpp"
#include "RTC/RTCP/FeedbackRtpTransport.hpp"
#include "RTC/RTCP/ReceiverReport.hpp"
#include "RTC/RtpPacket.hpp"
#include "RTC/RtpProbationGenerator.hpp"
#include "RTC/TrendCalculator.hpp"
#include "handles/Timer.hpp"
#include <libwebrtc/api/transport/goog_cc_factory.h>
#include <libwebrtc/api/transport/network_types.h>
#include <libwebrtc/call/rtp_transport_controller_send.h>
#include <libwebrtc/modules/pacing/packet_router.h>

namespace RTC
{
	class TransportCongestionControlClient : public webrtc::PacketRouter,
	                                         public webrtc::TargetTransferRateObserver,
	                                         public Timer::Listener
	{
	public:
		class Listener
		{
		public:
			virtual void OnTransportCongestionControlClientAvailableBitrate(
			  RTC::TransportCongestionControlClient* tccClient,
			  uint32_t availableBitrate,
			  uint32_t previousAvailableBitrate) = 0;
			virtual void OnTransportCongestionControlClientSendRtpPacket(
			  RTC::TransportCongestionControlClient* tccClient,
			  RTC::RtpPacket* packet,
			  const webrtc::PacedPacketInfo& pacingInfo) = 0;
		};

	public:
		TransportCongestionControlClient(
		  RTC::TransportCongestionControlClient::Listener* listener,
		  RTC::BweType bweType,
		  uint32_t initialAvailableBitrate);
		virtual ~TransportCongestionControlClient();

	public:
		RTC::BweType GetBweType() const;
		void TransportConnected();
		void TransportDisconnected();
		void InsertPacket(webrtc::RtpPacketSendInfo& packetInfo);
		webrtc::PacedPacketInfo GetPacingInfo();
		void PacketSent(webrtc::RtpPacketSendInfo& packetInfo, uint64_t nowMs);
		void ReceiveEstimatedBitrate(uint32_t bitrate);
		void ReceiveRtcpReceiverReport(const webrtc::RTCPReportBlock& report, float rtt, uint64_t nowMs);
		void ReceiveRtcpTransportFeedback(const RTC::RTCP::FeedbackRtpTransportPacket* feedback);
		void SetDesiredBitrate(uint32_t desiredBitrate, bool force);
		uint32_t GetAvailableBitrate() const;
		void RescheduleNextAvailableBitrateEvent();

	private:
		void MayEmitAvailableBitrateEvent(uint32_t previousAvailableBitrate);

		// jmillan: missing.
		// void OnRemoteNetworkEstimate(NetworkStateEstimate estimate) override;

		/* Pure virtual methods inherited from webrtc::TargetTransferRateObserver. */
	public:
		void OnTargetTransferRate(webrtc::TargetTransferRate targetTransferRate) override;

		/* Pure virtual methods inherited from webrtc::PacketRouter. */
	public:
		void SendPacket(RTC::RtpPacket* packet, const webrtc::PacedPacketInfo& pacingInfo) override;
		RTC::RtpPacket* GeneratePadding(size_t size) override;

		/* Pure virtual methods inherited from RTC::Timer. */
	public:
		void OnTimer(Timer* timer) override;

	private:
		// Passed by argument.
		Listener* listener{ nullptr };
		// Allocated by this.
		webrtc::NetworkControllerFactoryInterface* controllerFactory{ nullptr };
		webrtc::RtpTransportControllerSend* rtpTransportControllerSend{ nullptr };
		RTC::RtpProbationGenerator* probationGenerator{ nullptr };
		Timer* processTimer{ nullptr };
		// Others.
		RTC::BweType bweType;
		uint32_t initialAvailableBitrate{ 0u };
		uint32_t availableBitrate{ 0u };
		bool availableBitrateEventCalled{ false };
		uint64_t lastAvailableBitrateEventAtMs{ 0u };
		RTC::TrendCalculator desiredBitrateTrend;
	};

	/* Inline instance methods. */

	inline RTC::BweType TransportCongestionControlClient::GetBweType() const
	{
		return this->bweType;
	}
} // namespace RTC

#endif
