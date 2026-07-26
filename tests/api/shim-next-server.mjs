export class NextResponse extends Response {
  static json(data, init) { return Response.json(data, init); }
  static redirect(url, status = 307) { return Response.redirect(url, status); }
  // middleware 侧：放行并允许继续设置响应头
  static next() { return new Response(null, { status: 200 }); }
}
export class NextRequest extends Request {}
