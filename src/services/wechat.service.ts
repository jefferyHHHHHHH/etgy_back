import { env } from '../config/env';
import { HttpError } from '../utils/httpError';

export type WechatMiniProgramSession = {
	openId: string;
	unionId?: string;
	sessionKey: string;
};

type Jscode2SessionResponse = {
	openid?: string;
	unionid?: string;
	session_key?: string;
	errcode?: number;
	errmsg?: string;
};

export class WechatService {
	static getMiniProgramConfig() {
		const appId = (env.WECHAT_MP_APP_ID ?? '').trim();
		const appSecret = (env.WECHAT_MP_APP_SECRET ?? '').trim();
		if (!appId || !appSecret) {
			throw new HttpError(400, 'WeChat Mini Program not configured: set WECHAT_MP_APP_ID and WECHAT_MP_APP_SECRET');
		}
		return { appId, appSecret };
	}

	static async miniProgramCodeToSession(code: string): Promise<WechatMiniProgramSession> {
		const { appId, appSecret } = this.getMiniProgramConfig();
		const trimmedCode = (code ?? '').trim();
		if (!trimmedCode) {
			throw new HttpError(400, 'Missing code');
		}

		const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
		url.searchParams.set('appid', appId);
		url.searchParams.set('secret', appSecret);
		url.searchParams.set('js_code', trimmedCode);
		url.searchParams.set('grant_type', 'authorization_code');

		const resp = await fetch(url.toString(), {
			method: 'GET',
			headers: { accept: 'application/json' },
		});

		if (!resp.ok) {
			throw new HttpError(502, `WeChat API request failed: HTTP ${resp.status}`);
		}

		const data = (await resp.json()) as Jscode2SessionResponse;

		if (data.errcode) {
			throw new HttpError(400, `WeChat code exchange failed: ${data.errmsg ?? 'unknown error'} (${data.errcode})`);
		}

		if (!data.openid || !data.session_key) {
			throw new HttpError(502, 'WeChat API returned invalid session payload');
		}

		return {
			openId: data.openid,
			unionId: data.unionid,
			sessionKey: data.session_key,
		};
	}
}
