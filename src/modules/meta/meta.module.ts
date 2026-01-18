import metaRoutes from '../../routes/meta.routes';
import type { AppModule } from '../types';

export const metaModule: AppModule = {
	name: 'meta',
	basePath: '/api/meta',
	router: metaRoutes,
};

export default metaModule;
