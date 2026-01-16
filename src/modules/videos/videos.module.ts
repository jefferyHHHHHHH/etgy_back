import contentRoutes from '../../routes/content.routes';
import type { AppModule } from '../types';

export const videosModule: AppModule = {
	name: 'videos',
	basePath: '/api/videos',
	router: contentRoutes,
};

export default videosModule;
