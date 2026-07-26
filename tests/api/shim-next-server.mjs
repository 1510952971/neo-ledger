export class NextResponse extends Response {
  static json(data, init) { return Response.json(data, init); }
  static redirect(url, status = 307) { return Response.redirect(url, status); }
}
export class NextRequest extends Request {}
