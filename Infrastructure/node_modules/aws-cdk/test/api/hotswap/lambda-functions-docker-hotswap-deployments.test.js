"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_lambda_1 = require("@aws-sdk/client-lambda");
const setup = require("./hotswap-test-setup");
const common_1 = require("../../../lib/api/hotswap/common");
const mock_sdk_1 = require("../../util/mock-sdk");
const silent_1 = require("../../util/silent");
jest.mock('@aws-sdk/client-lambda', () => {
    const original = jest.requireActual('@aws-sdk/client-lambda');
    return {
        ...original,
        waitUntilFunctionUpdated: jest.fn(),
    };
});
let hotswapMockSdkProvider;
beforeEach(() => {
    jest.restoreAllMocks();
    hotswapMockSdkProvider = setup.setupHotswapTests();
    mock_sdk_1.mockLambdaClient.on(client_lambda_1.UpdateFunctionCodeCommand).resolves({
        PackageType: 'Image',
    });
});
describe.each([common_1.HotswapMode.FALL_BACK, common_1.HotswapMode.HOTSWAP_ONLY])('%p mode', (hotswapMode) => {
    (0, silent_1.silentTest)('calls the updateLambdaCode() API when it receives only a code difference in a Lambda function', async () => {
        // GIVEN
        setup.setCurrentCfnStackTemplate({
            Resources: {
                Func: {
                    Type: 'AWS::Lambda::Function',
                    Properties: {
                        Code: {
                            ImageUri: 'current-image',
                        },
                        FunctionName: 'my-function',
                    },
                    Metadata: {
                        'aws:asset:path': 'old-path',
                    },
                },
            },
        });
        const cdkStackArtifact = setup.cdkStackArtifactOf({
            template: {
                Resources: {
                    Func: {
                        Type: 'AWS::Lambda::Function',
                        Properties: {
                            Code: {
                                ImageUri: 'new-image',
                            },
                            FunctionName: 'my-function',
                        },
                        Metadata: {
                            'aws:asset:path': 'new-path',
                        },
                    },
                },
            },
        });
        // WHEN
        const deployStackResult = await hotswapMockSdkProvider.tryHotswapDeployment(hotswapMode, cdkStackArtifact);
        // THEN
        expect(deployStackResult).not.toBeUndefined();
        expect(mock_sdk_1.mockLambdaClient).toHaveReceivedCommandWith(client_lambda_1.UpdateFunctionCodeCommand, {
            FunctionName: 'my-function',
            ImageUri: 'new-image',
        });
    });
    (0, silent_1.silentTest)('calls the waiter with a delay of 5', async () => {
        // GIVEN
        setup.setCurrentCfnStackTemplate({
            Resources: {
                Func: {
                    Type: 'AWS::Lambda::Function',
                    Properties: {
                        Code: {
                            ImageUri: 'current-image',
                        },
                        FunctionName: 'my-function',
                    },
                    Metadata: {
                        'aws:asset:path': 'old-path',
                    },
                },
            },
        });
        const cdkStackArtifact = setup.cdkStackArtifactOf({
            template: {
                Resources: {
                    Func: {
                        Type: 'AWS::Lambda::Function',
                        Properties: {
                            Code: {
                                ImageUri: 'new-image',
                            },
                            FunctionName: 'my-function',
                        },
                        Metadata: {
                            'aws:asset:path': 'new-path',
                        },
                    },
                },
            },
        });
        // WHEN
        await hotswapMockSdkProvider.tryHotswapDeployment(hotswapMode, cdkStackArtifact);
        // THEN
        expect(client_lambda_1.waitUntilFunctionUpdated).toHaveBeenCalledWith(expect.objectContaining({
            minDelay: 5,
            maxDelay: 5,
            maxWaitTime: 5 * 60,
        }), { FunctionName: 'my-function' });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFtYmRhLWZ1bmN0aW9ucy1kb2NrZXItaG90c3dhcC1kZXBsb3ltZW50cy50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibGFtYmRhLWZ1bmN0aW9ucy1kb2NrZXItaG90c3dhcC1kZXBsb3ltZW50cy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsMERBQTZGO0FBQzdGLDhDQUE4QztBQUM5Qyw0REFBOEQ7QUFDOUQsa0RBQXVEO0FBQ3ZELDhDQUErQztBQUUvQyxJQUFJLENBQUMsSUFBSSxDQUFDLHdCQUF3QixFQUFFLEdBQUcsRUFBRTtJQUN2QyxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLHdCQUF3QixDQUFDLENBQUM7SUFFOUQsT0FBTztRQUNMLEdBQUcsUUFBUTtRQUNYLHdCQUF3QixFQUFFLElBQUksQ0FBQyxFQUFFLEVBQUU7S0FDcEMsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDO0FBRUgsSUFBSSxzQkFBb0QsQ0FBQztBQUV6RCxVQUFVLENBQUMsR0FBRyxFQUFFO0lBQ2QsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO0lBQ3ZCLHNCQUFzQixHQUFHLEtBQUssQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO0lBQ25ELDJCQUFnQixDQUFDLEVBQUUsQ0FBQyx5Q0FBeUIsQ0FBQyxDQUFDLFFBQVEsQ0FBQztRQUN0RCxXQUFXLEVBQUUsT0FBTztLQUNyQixDQUFDLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQztBQUVILFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxvQkFBVyxDQUFDLFNBQVMsRUFBRSxvQkFBVyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsU0FBUyxFQUFFLENBQUMsV0FBVyxFQUFFLEVBQUU7SUFDMUYsSUFBQSxtQkFBVSxFQUNSLCtGQUErRixFQUMvRixLQUFLLElBQUksRUFBRTtRQUNULFFBQVE7UUFDUixLQUFLLENBQUMsMEJBQTBCLENBQUM7WUFDL0IsU0FBUyxFQUFFO2dCQUNULElBQUksRUFBRTtvQkFDSixJQUFJLEVBQUUsdUJBQXVCO29CQUM3QixVQUFVLEVBQUU7d0JBQ1YsSUFBSSxFQUFFOzRCQUNKLFFBQVEsRUFBRSxlQUFlO3lCQUMxQjt3QkFDRCxZQUFZLEVBQUUsYUFBYTtxQkFDNUI7b0JBQ0QsUUFBUSxFQUFFO3dCQUNSLGdCQUFnQixFQUFFLFVBQVU7cUJBQzdCO2lCQUNGO2FBQ0Y7U0FDRixDQUFDLENBQUM7UUFDSCxNQUFNLGdCQUFnQixHQUFHLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQztZQUNoRCxRQUFRLEVBQUU7Z0JBQ1IsU0FBUyxFQUFFO29CQUNULElBQUksRUFBRTt3QkFDSixJQUFJLEVBQUUsdUJBQXVCO3dCQUM3QixVQUFVLEVBQUU7NEJBQ1YsSUFBSSxFQUFFO2dDQUNKLFFBQVEsRUFBRSxXQUFXOzZCQUN0Qjs0QkFDRCxZQUFZLEVBQUUsYUFBYTt5QkFDNUI7d0JBQ0QsUUFBUSxFQUFFOzRCQUNSLGdCQUFnQixFQUFFLFVBQVU7eUJBQzdCO3FCQUNGO2lCQUNGO2FBQ0Y7U0FDRixDQUFDLENBQUM7UUFFSCxPQUFPO1FBQ1AsTUFBTSxpQkFBaUIsR0FBRyxNQUFNLHNCQUFzQixDQUFDLG9CQUFvQixDQUFDLFdBQVcsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1FBRTNHLE9BQU87UUFDUCxNQUFNLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDOUMsTUFBTSxDQUFDLDJCQUFnQixDQUFDLENBQUMseUJBQXlCLENBQUMseUNBQXlCLEVBQUU7WUFDNUUsWUFBWSxFQUFFLGFBQWE7WUFDM0IsUUFBUSxFQUFFLFdBQVc7U0FDdEIsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUNGLENBQUM7SUFFRixJQUFBLG1CQUFVLEVBQUMsb0NBQW9DLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDMUQsUUFBUTtRQUNSLEtBQUssQ0FBQywwQkFBMEIsQ0FBQztZQUMvQixTQUFTLEVBQUU7Z0JBQ1QsSUFBSSxFQUFFO29CQUNKLElBQUksRUFBRSx1QkFBdUI7b0JBQzdCLFVBQVUsRUFBRTt3QkFDVixJQUFJLEVBQUU7NEJBQ0osUUFBUSxFQUFFLGVBQWU7eUJBQzFCO3dCQUNELFlBQVksRUFBRSxhQUFhO3FCQUM1QjtvQkFDRCxRQUFRLEVBQUU7d0JBQ1IsZ0JBQWdCLEVBQUUsVUFBVTtxQkFDN0I7aUJBQ0Y7YUFDRjtTQUNGLENBQUMsQ0FBQztRQUNILE1BQU0sZ0JBQWdCLEdBQUcsS0FBSyxDQUFDLGtCQUFrQixDQUFDO1lBQ2hELFFBQVEsRUFBRTtnQkFDUixTQUFTLEVBQUU7b0JBQ1QsSUFBSSxFQUFFO3dCQUNKLElBQUksRUFBRSx1QkFBdUI7d0JBQzdCLFVBQVUsRUFBRTs0QkFDVixJQUFJLEVBQUU7Z0NBQ0osUUFBUSxFQUFFLFdBQVc7NkJBQ3RCOzRCQUNELFlBQVksRUFBRSxhQUFhO3lCQUM1Qjt3QkFDRCxRQUFRLEVBQUU7NEJBQ1IsZ0JBQWdCLEVBQUUsVUFBVTt5QkFDN0I7cUJBQ0Y7aUJBQ0Y7YUFDRjtTQUNGLENBQUMsQ0FBQztRQUVILE9BQU87UUFDUCxNQUFNLHNCQUFzQixDQUFDLG9CQUFvQixDQUFDLFdBQVcsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1FBRWpGLE9BQU87UUFDUCxNQUFNLENBQUMsd0NBQXdCLENBQUMsQ0FBQyxvQkFBb0IsQ0FDbkQsTUFBTSxDQUFDLGdCQUFnQixDQUFDO1lBQ3RCLFFBQVEsRUFBRSxDQUFDO1lBQ1gsUUFBUSxFQUFFLENBQUM7WUFDWCxXQUFXLEVBQUUsQ0FBQyxHQUFHLEVBQUU7U0FDcEIsQ0FBQyxFQUNGLEVBQUUsWUFBWSxFQUFFLGFBQWEsRUFBRSxDQUNoQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFVwZGF0ZUZ1bmN0aW9uQ29kZUNvbW1hbmQsIHdhaXRVbnRpbEZ1bmN0aW9uVXBkYXRlZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1sYW1iZGEnO1xuaW1wb3J0ICogYXMgc2V0dXAgZnJvbSAnLi9ob3Rzd2FwLXRlc3Qtc2V0dXAnO1xuaW1wb3J0IHsgSG90c3dhcE1vZGUgfSBmcm9tICcuLi8uLi8uLi9saWIvYXBpL2hvdHN3YXAvY29tbW9uJztcbmltcG9ydCB7IG1vY2tMYW1iZGFDbGllbnQgfSBmcm9tICcuLi8uLi91dGlsL21vY2stc2RrJztcbmltcG9ydCB7IHNpbGVudFRlc3QgfSBmcm9tICcuLi8uLi91dGlsL3NpbGVudCc7XG5cbmplc3QubW9jaygnQGF3cy1zZGsvY2xpZW50LWxhbWJkYScsICgpID0+IHtcbiAgY29uc3Qgb3JpZ2luYWwgPSBqZXN0LnJlcXVpcmVBY3R1YWwoJ0Bhd3Mtc2RrL2NsaWVudC1sYW1iZGEnKTtcblxuICByZXR1cm4ge1xuICAgIC4uLm9yaWdpbmFsLFxuICAgIHdhaXRVbnRpbEZ1bmN0aW9uVXBkYXRlZDogamVzdC5mbigpLFxuICB9O1xufSk7XG5cbmxldCBob3Rzd2FwTW9ja1Nka1Byb3ZpZGVyOiBzZXR1cC5Ib3Rzd2FwTW9ja1Nka1Byb3ZpZGVyO1xuXG5iZWZvcmVFYWNoKCgpID0+IHtcbiAgamVzdC5yZXN0b3JlQWxsTW9ja3MoKTtcbiAgaG90c3dhcE1vY2tTZGtQcm92aWRlciA9IHNldHVwLnNldHVwSG90c3dhcFRlc3RzKCk7XG4gIG1vY2tMYW1iZGFDbGllbnQub24oVXBkYXRlRnVuY3Rpb25Db2RlQ29tbWFuZCkucmVzb2x2ZXMoe1xuICAgIFBhY2thZ2VUeXBlOiAnSW1hZ2UnLFxuICB9KTtcbn0pO1xuXG5kZXNjcmliZS5lYWNoKFtIb3Rzd2FwTW9kZS5GQUxMX0JBQ0ssIEhvdHN3YXBNb2RlLkhPVFNXQVBfT05MWV0pKCclcCBtb2RlJywgKGhvdHN3YXBNb2RlKSA9PiB7XG4gIHNpbGVudFRlc3QoXG4gICAgJ2NhbGxzIHRoZSB1cGRhdGVMYW1iZGFDb2RlKCkgQVBJIHdoZW4gaXQgcmVjZWl2ZXMgb25seSBhIGNvZGUgZGlmZmVyZW5jZSBpbiBhIExhbWJkYSBmdW5jdGlvbicsXG4gICAgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gR0lWRU5cbiAgICAgIHNldHVwLnNldEN1cnJlbnRDZm5TdGFja1RlbXBsYXRlKHtcbiAgICAgICAgUmVzb3VyY2VzOiB7XG4gICAgICAgICAgRnVuYzoge1xuICAgICAgICAgICAgVHlwZTogJ0FXUzo6TGFtYmRhOjpGdW5jdGlvbicsXG4gICAgICAgICAgICBQcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgICAgIENvZGU6IHtcbiAgICAgICAgICAgICAgICBJbWFnZVVyaTogJ2N1cnJlbnQtaW1hZ2UnLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICBGdW5jdGlvbk5hbWU6ICdteS1mdW5jdGlvbicsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgTWV0YWRhdGE6IHtcbiAgICAgICAgICAgICAgJ2F3czphc3NldDpwYXRoJzogJ29sZC1wYXRoJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgICAgY29uc3QgY2RrU3RhY2tBcnRpZmFjdCA9IHNldHVwLmNka1N0YWNrQXJ0aWZhY3RPZih7XG4gICAgICAgIHRlbXBsYXRlOiB7XG4gICAgICAgICAgUmVzb3VyY2VzOiB7XG4gICAgICAgICAgICBGdW5jOiB7XG4gICAgICAgICAgICAgIFR5cGU6ICdBV1M6OkxhbWJkYTo6RnVuY3Rpb24nLFxuICAgICAgICAgICAgICBQcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgICAgICAgQ29kZToge1xuICAgICAgICAgICAgICAgICAgSW1hZ2VVcmk6ICduZXctaW1hZ2UnLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgRnVuY3Rpb25OYW1lOiAnbXktZnVuY3Rpb24nLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICBNZXRhZGF0YToge1xuICAgICAgICAgICAgICAgICdhd3M6YXNzZXQ6cGF0aCc6ICduZXctcGF0aCcsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgLy8gV0hFTlxuICAgICAgY29uc3QgZGVwbG95U3RhY2tSZXN1bHQgPSBhd2FpdCBob3Rzd2FwTW9ja1Nka1Byb3ZpZGVyLnRyeUhvdHN3YXBEZXBsb3ltZW50KGhvdHN3YXBNb2RlLCBjZGtTdGFja0FydGlmYWN0KTtcblxuICAgICAgLy8gVEhFTlxuICAgICAgZXhwZWN0KGRlcGxveVN0YWNrUmVzdWx0KS5ub3QudG9CZVVuZGVmaW5lZCgpO1xuICAgICAgZXhwZWN0KG1vY2tMYW1iZGFDbGllbnQpLnRvSGF2ZVJlY2VpdmVkQ29tbWFuZFdpdGgoVXBkYXRlRnVuY3Rpb25Db2RlQ29tbWFuZCwge1xuICAgICAgICBGdW5jdGlvbk5hbWU6ICdteS1mdW5jdGlvbicsXG4gICAgICAgIEltYWdlVXJpOiAnbmV3LWltYWdlJyxcbiAgICAgIH0pO1xuICAgIH0sXG4gICk7XG5cbiAgc2lsZW50VGVzdCgnY2FsbHMgdGhlIHdhaXRlciB3aXRoIGEgZGVsYXkgb2YgNScsIGFzeW5jICgpID0+IHtcbiAgICAvLyBHSVZFTlxuICAgIHNldHVwLnNldEN1cnJlbnRDZm5TdGFja1RlbXBsYXRlKHtcbiAgICAgIFJlc291cmNlczoge1xuICAgICAgICBGdW5jOiB7XG4gICAgICAgICAgVHlwZTogJ0FXUzo6TGFtYmRhOjpGdW5jdGlvbicsXG4gICAgICAgICAgUHJvcGVydGllczoge1xuICAgICAgICAgICAgQ29kZToge1xuICAgICAgICAgICAgICBJbWFnZVVyaTogJ2N1cnJlbnQtaW1hZ2UnLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIEZ1bmN0aW9uTmFtZTogJ215LWZ1bmN0aW9uJyxcbiAgICAgICAgICB9LFxuICAgICAgICAgIE1ldGFkYXRhOiB7XG4gICAgICAgICAgICAnYXdzOmFzc2V0OnBhdGgnOiAnb2xkLXBhdGgnLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0pO1xuICAgIGNvbnN0IGNka1N0YWNrQXJ0aWZhY3QgPSBzZXR1cC5jZGtTdGFja0FydGlmYWN0T2Yoe1xuICAgICAgdGVtcGxhdGU6IHtcbiAgICAgICAgUmVzb3VyY2VzOiB7XG4gICAgICAgICAgRnVuYzoge1xuICAgICAgICAgICAgVHlwZTogJ0FXUzo6TGFtYmRhOjpGdW5jdGlvbicsXG4gICAgICAgICAgICBQcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgICAgIENvZGU6IHtcbiAgICAgICAgICAgICAgICBJbWFnZVVyaTogJ25ldy1pbWFnZScsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIEZ1bmN0aW9uTmFtZTogJ215LWZ1bmN0aW9uJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBNZXRhZGF0YToge1xuICAgICAgICAgICAgICAnYXdzOmFzc2V0OnBhdGgnOiAnbmV3LXBhdGgnLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIFdIRU5cbiAgICBhd2FpdCBob3Rzd2FwTW9ja1Nka1Byb3ZpZGVyLnRyeUhvdHN3YXBEZXBsb3ltZW50KGhvdHN3YXBNb2RlLCBjZGtTdGFja0FydGlmYWN0KTtcblxuICAgIC8vIFRIRU5cbiAgICBleHBlY3Qod2FpdFVudGlsRnVuY3Rpb25VcGRhdGVkKS50b0hhdmVCZWVuQ2FsbGVkV2l0aChcbiAgICAgIGV4cGVjdC5vYmplY3RDb250YWluaW5nKHtcbiAgICAgICAgbWluRGVsYXk6IDUsXG4gICAgICAgIG1heERlbGF5OiA1LFxuICAgICAgICBtYXhXYWl0VGltZTogNSAqIDYwLFxuICAgICAgfSksXG4gICAgICB7IEZ1bmN0aW9uTmFtZTogJ215LWZ1bmN0aW9uJyB9LFxuICAgICk7XG4gIH0pO1xufSk7XG4iXX0=