export default {
  fetch() {
    return new Response(
      'Neo Ledger 正在迁移数据，请稍后再试。迁移期间请勿在旧客户端重复提交操作。',
      {
        status: 503,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'no-store',
          'retry-after': '300',
        },
      },
    );
  },
};
