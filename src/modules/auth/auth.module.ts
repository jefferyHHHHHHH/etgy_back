import authRoutes from '../../routes/auth.routes';
import type { AppModule } from '../types';

export const authModule: AppModule = {
	name: 'auth',
	basePath: '/api/auth',
	router: authRoutes,
};

export default authModule;
