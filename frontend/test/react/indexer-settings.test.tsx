import { notifyManager, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { queryClient } from '../../src/react/query';
import { IndexerSettings } from '../../src/react/settings/indexer-settings';
import { buttonNamed, click, fetchMock, mount, pending, settle } from './render';

notifyManager.setScheduler(notify => notify());
afterEach(() => queryClient.clear());
it('进入资源搜索设置时先读取当前值，再创建表单草稿', async () => {
  const row = { key: 'one', name: '缓存名称', url: 'https://example.com/api', enabled: true, api_key_set: false };
  queryClient.setQueryData(['indexers'], { indexers: [row], max_indexers: 4 });
  const hold = pending<unknown>();
  vi.stubGlobal('fetch', vi.fn(() => hold.answer));
  const host = await mount(<QueryClientProvider client={queryClient}><IndexerSettings receipt={vi.fn()} /></QueryClientProvider>);
  expect(host.querySelector('form')).toBeNull();
  await hold.release({ ok: true, status: 200, json: async () => ({ indexers: [{ ...row, name: '当前名称' }], max_indexers: 4 }) });
  await settle();
  expect(host.querySelector<HTMLInputElement>('input')?.value).toBe('当前名称');
});

it('非安全上下文里没有 crypto.randomUUID，点「添加索引器」照样加出一行', async () => {
  // http://<局域网 IP> 打开时不是安全上下文：crypto 还在，randomUUID 不在。
  vi.stubGlobal('crypto', { getRandomValues: (buffer: Uint8Array) => buffer });
  const row = { key: 'one', name: '缓存名称', url: 'https://example.com/api', enabled: true, api_key_set: false };
  vi.stubGlobal('fetch', fetchMock(200, { indexers: [row], max_indexers: 4 }));
  const host = await mount(<QueryClientProvider client={queryClient}><IndexerSettings receipt={vi.fn()} /></QueryClientProvider>);
  const addresses = () => host.querySelectorAll('input[type="url"]');
  await vi.waitFor(async () => {
    await settle();
    if (addresses().length !== 1) throw new Error('表单还没画出来');
  });
  await click(buttonNamed('添加索引器', host));
  await settle();
  expect(addresses()).toHaveLength(2);
});
