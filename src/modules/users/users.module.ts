import userRoutes from '../../routes/user.routes';
import type { AppModule } from '../types';

export const usersModule: AppModule = {
	name: 'users',
	basePath: '/api/users',
	router: userRoutes,
};

export default usersModule;
