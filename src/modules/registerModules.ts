import type { Express } from 'express';
import authModule from './auth/auth.module';
import usersModule from './users/users.module';
import videosModule from './videos/videos.module';
import liveModule from './live/live.module';
import metaModule from './meta/meta.module';
import platformModule from './platform/platform.module';
import ossModule from './oss/oss.module';
import type { AppModule } from './types';

const modules: AppModule[] = [authModule, usersModule, videosModule, liveModule, metaModule, platformModule, ossModule];

export const registerModules = (app: Express) => {
	for (const mod of modules) {
		app.use(mod.basePath, mod.router);
	}
};
