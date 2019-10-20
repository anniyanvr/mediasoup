#define MS_CLASS "UdpSocket"
// #define MS_LOG_DEV_LEVEL 3

#include "handles/UdpSocket.hpp"
#include "Logger.hpp"
#include "MediaSoupErrors.hpp"
#include "Utils.hpp"
#include <cstring> // std::memcpy()

/* Static. */

static constexpr size_t ReadBufferSize{ 65536 };
static uint8_t ReadBuffer[ReadBufferSize];

/* Static methods for UV callbacks. */

inline static void onAlloc(uv_handle_t* handle, size_t suggestedSize, uv_buf_t* buf)
{
	auto* socket = static_cast<UdpSocket*>(handle->data);

	if (socket)
		socket->OnUvRecvAlloc(suggestedSize, buf);
}

inline static void onRecv(
  uv_udp_t* handle, ssize_t nread, const uv_buf_t* buf, const struct sockaddr* addr, unsigned int flags)
{
	auto* socket = static_cast<UdpSocket*>(handle->data);

	if (socket)
		socket->OnUvRecv(nread, buf, addr, flags);
}

inline static void onSend(uv_udp_send_t* req, int status)
{
	auto* sendData = static_cast<UdpSocket::UvSendData*>(req->data);
	auto* handle   = req->handle;
	auto* socket   = static_cast<UdpSocket*>(handle->data);
	auto* cb       = sendData->cb;

	// Delete the UvSendData struct (which includes the uv_req_t and the store char[]).
	std::free(sendData);

	if (socket)
		socket->OnUvSend(status, cb);

	delete cb;
}

inline static void onClose(uv_handle_t* handle)
{
	delete handle;
}

/* Instance methods. */

// NOLINTNEXTLINE(cppcoreguidelines-pro-type-member-init)
UdpSocket::UdpSocket(uv_udp_t* uvHandle) : uvHandle(uvHandle)
{
	MS_TRACE();

	int err;

	this->uvHandle->data = static_cast<void*>(this);

	err = uv_udp_recv_start(
	  this->uvHandle, static_cast<uv_alloc_cb>(onAlloc), static_cast<uv_udp_recv_cb>(onRecv));

	if (err != 0)
	{
		uv_close(reinterpret_cast<uv_handle_t*>(this->uvHandle), static_cast<uv_close_cb>(onClose));

		MS_THROW_ERROR("uv_udp_recv_start() failed: %s", uv_strerror(err));
	}

	// Set local address.
	if (!SetLocalAddress())
	{
		uv_close(reinterpret_cast<uv_handle_t*>(this->uvHandle), static_cast<uv_close_cb>(onClose));

		MS_THROW_ERROR("error setting local IP and port");
	}
}

UdpSocket::~UdpSocket()
{
	MS_TRACE();

	if (!this->closed)
		Close();
}

void UdpSocket::Close()
{
	MS_TRACE();

	if (this->closed)
		return;

	this->closed = true;

	// Tell the UV handle that the UdpSocket has been closed.
	this->uvHandle->data = nullptr;

	// Don't read more.
	int err = uv_udp_recv_stop(this->uvHandle);

	if (err != 0)
		MS_ABORT("uv_udp_recv_stop() failed: %s", uv_strerror(err));

	uv_close(reinterpret_cast<uv_handle_t*>(this->uvHandle), static_cast<uv_close_cb>(onClose));
}

void UdpSocket::Dump() const
{
	MS_DUMP("<UdpSocket>");
	MS_DUMP("  localIp   : %s", this->localIp.c_str());
	MS_DUMP("  localPort : %" PRIu16, static_cast<uint16_t>(this->localPort));
	MS_DUMP("  closed    : %s", !this->closed ? "open" : "closed");
	MS_DUMP("</UdpSocket>");
}

void UdpSocket::Send(
  const uint8_t* data, size_t len, const struct sockaddr* addr, UdpSocket::onSendCallback* cb)
{
	MS_TRACE();

	if (this->closed)
	{
		if (cb)
			(*cb)(false);

		return;
	}

	if (len == 0)
	{
		if (cb)
			(*cb)(false);

		return;
	}

	// First try uv_udp_try_send(). In case it can not directly send the datagram
	// then build a uv_req_t and use uv_udp_send().

	uv_buf_t buffer = uv_buf_init(reinterpret_cast<char*>(const_cast<uint8_t*>(data)), len);
	int sent        = uv_udp_try_send(this->uvHandle, &buffer, 1, addr);

	// Entire datagram was sent. Done.
	if (sent == static_cast<int>(len))
	{
		// Update sent bytes.
		this->sentBytes += sent;

		if (cb)
		{
			(*cb)(true);

			delete cb;
		}

		return;
	}
	if (sent >= 0)
	{
		MS_WARN_DEV("datagram truncated (just %d of %zu bytes were sent)", sent, len);

		// Update sent bytes.
		this->sentBytes += sent;

		if (cb)
		{
			(*cb)(false);

			delete cb;
		}

		return;
	}
	// Error,
	if (sent != UV_EAGAIN)
	{
		MS_WARN_DEV("uv_udp_try_send() failed: %s", uv_strerror(sent));

		if (cb)
		{
			(*cb)(false);

			delete cb;
		}

		return;
	}

	// Otherwise UV_EAGAIN was returned so cannot send data at first time. Use uv_udp_send().
	// MS_DEBUG_DEV("could not send the datagram at first time, using uv_udp_send() now");

	// Allocate a special UvSendData struct pointer.
	auto* sendData = static_cast<UvSendData*>(std::malloc(sizeof(UvSendData) + len));

	std::memcpy(sendData->store, data, len);
	sendData->req.data = static_cast<void*>(sendData);
	sendData->cb       = cb;

	buffer = uv_buf_init(reinterpret_cast<char*>(sendData->store), len);

	int err = uv_udp_send(
	  &sendData->req, this->uvHandle, &buffer, 1, addr, static_cast<uv_udp_send_cb>(onSend));

	if (err != 0)
	{
		// NOTE: uv_udp_send() returns error if a wrong INET family is given
		// (IPv6 destination on a IPv4 binded socket), so be ready.
		MS_WARN_DEV("uv_udp_send() failed: %s", uv_strerror(err));

		// Delete the UvSendData struct (which includes the uv_req_t and the store char[]).
		std::free(sendData);

		if (cb)
		{
			(*cb)(false);

			delete cb;
		}
	}
	else
	{
		// Update sent bytes.
		this->sentBytes += len;
	}
}

bool UdpSocket::SetLocalAddress()
{
	MS_TRACE();

	int err;
	int len = sizeof(this->localAddr);

	err =
	  uv_udp_getsockname(this->uvHandle, reinterpret_cast<struct sockaddr*>(&this->localAddr), &len);

	if (err != 0)
	{
		MS_ERROR("uv_udp_getsockname() failed: %s", uv_strerror(err));

		return false;
	}

	int family;

	Utils::IP::GetAddressInfo(
	  reinterpret_cast<const struct sockaddr*>(&this->localAddr), family, this->localIp, this->localPort);

	return true;
}

inline void UdpSocket::OnUvRecvAlloc(size_t /*suggestedSize*/, uv_buf_t* buf)
{
	MS_TRACE();

	// Tell UV to write into the static buffer.
	buf->base = reinterpret_cast<char*>(ReadBuffer);
	// Give UV all the buffer space.
	buf->len = ReadBufferSize;
}

inline void UdpSocket::OnUvRecv(
  ssize_t nread, const uv_buf_t* buf, const struct sockaddr* addr, unsigned int flags)
{
	MS_TRACE();

	// NOTE: libuv calls twice to alloc & recv when a datagram is received, the
	// second one with nread = 0 and addr = NULL. Ignore it.
	if (nread == 0)
		return;

	// Check flags.
	if ((flags & UV_UDP_PARTIAL) != 0u)
	{
		MS_ERROR("received datagram was truncated due to insufficient buffer, ignoring it");

		return;
	}

	// Data received.
	if (nread > 0)
	{
		// Update received bytes.
		this->recvBytes += nread;

		// Notify the subclass.
		UserOnUdpDatagramReceived(reinterpret_cast<uint8_t*>(buf->base), nread, addr);
	}
	// Some error.
	else
	{
		MS_DEBUG_DEV("read error: %s", uv_strerror(nread));
	}
}

inline void UdpSocket::OnUvSend(int status, UdpSocket::onSendCallback* cb)
{
	MS_TRACE();

	if (status == 0)
	{
		if (cb)
			(*cb)(true);
	}
	else
	{
#if MS_LOG_DEV_LEVEL == 3
		MS_DEBUG_DEV("send error: %s", uv_strerror(status));
#endif

		if (cb)
			(*cb)(false);
	}
}
