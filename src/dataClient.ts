import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../amplify/data/resource';

// Called only after configure.ts has configured a deployed data backend.
export const createDataClient = () => generateClient<Schema>({ authMode: 'userPool' });
