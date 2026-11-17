import { IoTClient, DescribeEndpointCommand } from '@aws-sdk/client-iot';
import { IoTDataPlaneClient } from '@aws-sdk/client-iot-data-plane';

let dataClient: Promise<IoTDataPlaneClient> | undefined;
export function getIotDataClient() {
  if (!dataClient) {
    dataClient = new IoTClient({}).send(new DescribeEndpointCommand({ endpointType: 'iot:Data-ATS' }))
      .then(result => {
        if (!result.endpointAddress) throw new Error('IoT endpoint missing');
        return new IoTDataPlaneClient({ endpoint: `https://${result.endpointAddress}` });
      }).catch(error => { dataClient = undefined; throw error; });
  }
  return dataClient;
}
