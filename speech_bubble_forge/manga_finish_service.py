"""One CPU conversion at a time, including after a client disconnects."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
import threading


class BusyError(RuntimeError):
    pass


class UnavailableError(RuntimeError):
    pass


class MangaFinishService:
    def __init__(self):
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="sbe-manga")
        self._lock = threading.Lock()
        self.lease = None
        self.accepting = True

    def reserve(self):
        with self._lock:
            if not self.accepting:
                raise UnavailableError()
            if self.lease is not None:
                raise BusyError()
            self.lease = object()
            return self.lease

    def release(self, lease):
        with self._lock:
            if self.lease is lease:
                self.lease = None

    async def convert(self, lease, raw, settings):
        try:
            from .manga_finish import convert_image
            future = self.executor.submit(convert_image, raw, settings)
        except BaseException:
            self.release(lease)
            raise
        # Release in the worker callback, even if the requesting loop has closed.
        future.add_done_callback(lambda _: self.release(lease))
        wrapped = asyncio.wrap_future(future)
        wrapped.add_done_callback(lambda f: None if f.cancelled() else f.exception())
        return await asyncio.shield(wrapped)

    def shutdown(self):
        """Also callable from Forge's synchronous script-unloaded callback."""
        with self._lock:
            self.accepting = False
        self.executor.shutdown(wait=True, cancel_futures=True)

    async def close(self):
        await asyncio.to_thread(self.shutdown)
