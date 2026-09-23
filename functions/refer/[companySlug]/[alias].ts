import { serveShareRoute } from "../../_lib/shareMeta";

export const onRequest: PagesFunction<{ API_ORIGIN?: string }> = context => serveShareRoute(context);
