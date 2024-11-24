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
    hotswapMockSdkProvider = setup.setupHotswapTests();
});
describe.each([common_1.HotswapMode.FALL_BACK, common_1.HotswapMode.HOTSWAP_ONLY])('%p mode', (hotswapMode) => {
    (0, silent_1.silentTest)('returns undefined when a new Lambda function is added to the Stack', async () => {
        // GIVEN
        const cdkStackArtifact = setup.cdkStackArtifactOf({
            template: {
                Resources: {
                    Func: {
                        Type: 'AWS::Lambda::Function',
                    },
                },
            },
        });
        if (hotswapMode === common_1.HotswapMode.FALL_BACK) {
            // WHEN
            const deployStackResult = await hotswapMockSdkProvider.tryHotswapDeployment(hotswapMode, cdkStackArtifact);
            // THEN
            expect(deployStackResult).toBeUndefined();
        }
        else if (hotswapMode === common_1.HotswapMode.HOTSWAP_ONLY) {
            // WHEN
            const deployStackResult = await hotswapMockSdkProvider.tryHotswapDeployment(hotswapMode, cdkStackArtifact);
            // THEN
            expect(deployStackResult).not.toBeUndefined();
            expect(deployStackResult?.noOp).toEqual(true);
            expect(mock_sdk_1.mockLambdaClient).not.toHaveReceivedCommand(client_lambda_1.UpdateFunctionCodeCommand);
        }
    });
    (0, silent_1.silentTest)('calls the updateLambdaCode() API when it receives only a code difference in a Lambda function', async () => {
        // GIVEN
        setup.setCurrentCfnStackTemplate({
            Resources: {
                Func: {
                    Type: 'AWS::Lambda::Function',
                    Properties: {
                        Code: {
                            S3Bucket: 'current-bucket',
                            S3Key: 'current-key',
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
                                S3Bucket: 'current-bucket',
                                S3Key: 'new-key',
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
            S3Bucket: 'current-bucket',
            S3Key: 'new-key',
        });
    });
    (0, silent_1.silentTest)("correctly evaluates the function's name when it references a different resource from the template", async () => {
        // GIVEN
        setup.setCurrentCfnStackTemplate({
            Resources: {
                Bucket: {
                    Type: 'AWS::S3::Bucket',
                },
                Func: {
                    Type: 'AWS::Lambda::Function',
                    Properties: {
                        Code: {
                            S3Bucket: 'current-bucket',
                            S3Key: 'current-key',
                        },
                        FunctionName: {
                            'Fn::Join': ['-', ['lambda', { Ref: 'Bucket' }, 'function']],
                        },
                    },
                    Metadata: {
                        'aws:asset:path': 'old-path',
                    },
                },
            },
        });
        setup.pushStackResourceSummaries(setup.stackSummaryOf('Bucket', 'AWS::S3::Bucket', 'mybucket'));
        const cdkStackArtifact = setup.cdkStackArtifactOf({
            template: {
                Resources: {
                    Bucket: {
                        Type: 'AWS::S3::Bucket',
                    },
                    Func: {
                        Type: 'AWS::Lambda::Function',
                        Properties: {
                            Code: {
                                S3Bucket: 'current-bucket',
                                S3Key: 'new-key',
                            },
                            FunctionName: {
                                'Fn::Join': ['-', ['lambda', { Ref: 'Bucket' }, 'function']],
                            },
                        },
                        Metadata: {
                            'aws:asset:path': 'old-path',
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
            FunctionName: 'lambda-mybucket-function',
            S3Bucket: 'current-bucket',
            S3Key: 'new-key',
        });
    });
    (0, silent_1.silentTest)("correctly falls back to taking the function's name from the current stack if it can't evaluate it in the template", async () => {
        // GIVEN
        setup.setCurrentCfnStackTemplate({
            Parameters: {
                Param1: { Type: 'String' },
                AssetBucketParam: { Type: 'String' },
            },
            Resources: {
                Func: {
                    Type: 'AWS::Lambda::Function',
                    Properties: {
                        Code: {
                            S3Bucket: { Ref: 'AssetBucketParam' },
                            S3Key: 'current-key',
                        },
                        FunctionName: { Ref: 'Param1' },
                    },
                    Metadata: {
                        'aws:asset:path': 'old-path',
                    },
                },
            },
        });
        setup.pushStackResourceSummaries(setup.stackSummaryOf('Func', 'AWS::Lambda::Function', 'my-function'));
        const cdkStackArtifact = setup.cdkStackArtifactOf({
            template: {
                Parameters: {
                    Param1: { Type: 'String' },
                    AssetBucketParam: { Type: 'String' },
                },
                Resources: {
                    Func: {
                        Type: 'AWS::Lambda::Function',
                        Properties: {
                            Code: {
                                S3Bucket: { Ref: 'AssetBucketParam' },
                                S3Key: 'new-key',
                            },
                            FunctionName: { Ref: 'Param1' },
                        },
                        Metadata: {
                            'aws:asset:path': 'new-path',
                        },
                    },
                },
            },
        });
        // WHEN
        const deployStackResult = await hotswapMockSdkProvider.tryHotswapDeployment(hotswapMode, cdkStackArtifact, {
            AssetBucketParam: 'asset-bucket',
        });
        // THEN
        expect(deployStackResult).not.toBeUndefined();
        expect(mock_sdk_1.mockLambdaClient).toHaveReceivedCommandWith(client_lambda_1.UpdateFunctionCodeCommand, {
            FunctionName: 'my-function',
            S3Bucket: 'asset-bucket',
            S3Key: 'new-key',
        });
    });
    (0, silent_1.silentTest)("will not perform a hotswap deployment if it cannot find a Ref target (outside the function's name)", async () => {
        // GIVEN
        setup.setCurrentCfnStackTemplate({
            Parameters: {
                Param1: { Type: 'String' },
            },
            Resources: {
                Func: {
                    Type: 'AWS::Lambda::Function',
                    Properties: {
                        Code: {
                            S3Bucket: { 'Fn::Sub': '${Param1}' },
                            S3Key: 'current-key',
                        },
                    },
                    Metadata: {
                        'aws:asset:path': 'old-path',
                    },
                },
            },
        });
        setup.pushStackResourceSummaries(setup.stackSummaryOf('Func', 'AWS::Lambda::Function', 'my-func'));
        const cdkStackArtifact = setup.cdkStackArtifactOf({
            template: {
                Parameters: {
                    Param1: { Type: 'String' },
                },
                Resources: {
                    Func: {
                        Type: 'AWS::Lambda::Function',
                        Properties: {
                            Code: {
                                S3Bucket: { 'Fn::Sub': '${Param1}' },
                                S3Key: 'new-key',
                            },
                        },
                        Metadata: {
                            'aws:asset:path': 'new-path',
                        },
                    },
                },
            },
        });
        // THEN
        await expect(() => hotswapMockSdkProvider.tryHotswapDeployment(hotswapMode, cdkStackArtifact)).rejects.toThrow(/Parameter or resource 'Param1' could not be found for evaluation/);
    });
    (0, silent_1.silentTest)("will not perform a hotswap deployment if it doesn't know how to handle a specific attribute (outside the function's name)", async () => {
        // GIVEN
        setup.setCurrentCfnStackTemplate({
            Resources: {
                Bucket: {
                    Type: 'AWS::S3::Bucket',
                },
                Func: {
                    Type: 'AWS::Lambda::Function',
                    Properties: {
                        Code: {
                            S3Bucket: { 'Fn::GetAtt': ['Bucket', 'UnknownAttribute'] },
                            S3Key: 'current-key',
                        },
                    },
                    Metadata: {
                        'aws:asset:path': 'old-path',
                    },
                },
            },
        });
        setup.pushStackResourceSummaries(setup.stackSummaryOf('Func', 'AWS::Lambda::Function', 'my-func'), setup.stackSummaryOf('Bucket', 'AWS::S3::Bucket', 'my-bucket'));
        const cdkStackArtifact = setup.cdkStackArtifactOf({
            template: {
                Resources: {
                    Bucket: {
                        Type: 'AWS::S3::Bucket',
                    },
                    Func: {
                        Type: 'AWS::Lambda::Function',
                        Properties: {
                            Code: {
                                S3Bucket: { 'Fn::GetAtt': ['Bucket', 'UnknownAttribute'] },
                                S3Key: 'new-key',
                            },
                        },
                        Metadata: {
                            'aws:asset:path': 'new-path',
                        },
                    },
                },
            },
        });
        // THEN
        await expect(() => hotswapMockSdkProvider.tryHotswapDeployment(hotswapMode, cdkStackArtifact)).rejects.toThrow("We don't support the 'UnknownAttribute' attribute of the 'AWS::S3::Bucket' resource. This is a CDK limitation. Please report it at https://github.com/aws/aws-cdk/issues/new/choose");
    });
    (0, silent_1.silentTest)('calls the updateLambdaCode() API when it receives a code difference in a Lambda function with no name', async () => {
        // GIVEN
        setup.setCurrentCfnStackTemplate({
            Resources: {
                Func: {
                    Type: 'AWS::Lambda::Function',
                    Properties: {
                        Code: {
                            S3Bucket: 'current-bucket',
                            S3Key: 'current-key',
                        },
                    },
                    Metadata: {
                        'aws:asset:path': 'current-path',
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
                                S3Bucket: 'current-bucket',
                                S3Key: 'new-key',
                            },
                        },
                        Metadata: {
                            'aws:asset:path': 'current-path',
                        },
                    },
                },
            },
        });
        // WHEN
        setup.pushStackResourceSummaries(setup.stackSummaryOf('Func', 'AWS::Lambda::Function', 'mock-function-resource-id'));
        const deployStackResult = await hotswapMockSdkProvider.tryHotswapDeployment(hotswapMode, cdkStackArtifact);
        // THEN
        expect(deployStackResult).not.toBeUndefined();
        expect(mock_sdk_1.mockLambdaClient).toHaveReceivedCommandWith(client_lambda_1.UpdateFunctionCodeCommand, {
            FunctionName: 'mock-function-resource-id',
            S3Bucket: 'current-bucket',
            S3Key: 'new-key',
        });
    });
    (0, silent_1.silentTest)('does not call the updateLambdaCode() API when it receives a change that is not a code difference in a Lambda function', async () => {
        // GIVEN
        setup.setCurrentCfnStackTemplate({
            Resources: {
                Func: {
                    Type: 'AWS::Lambda::Function',
                    Properties: {
                        Code: {
                            S3Bucket: 'current-bucket',
                            S3Key: 'current-key',
                        },
                        PackageType: 'Zip',
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
                                S3Bucket: 'current-bucket',
                                S3Key: 'current-key',
                            },
                            PackageType: 'Image',
                        },
                    },
                },
            },
        });
        if (hotswapMode === common_1.HotswapMode.FALL_BACK) {
            // WHEN
            const deployStackResult = await hotswapMockSdkProvider.tryHotswapDeployment(hotswapMode, cdkStackArtifact);
            // THEN
            expect(deployStackResult).toBeUndefined();
            expect(mock_sdk_1.mockLambdaClient).not.toHaveReceivedCommand(client_lambda_1.UpdateFunctionCodeCommand);
        }
        else if (hotswapMode === common_1.HotswapMode.HOTSWAP_ONLY) {
            // WHEN
            const deployStackResult = await hotswapMockSdkProvider.tryHotswapDeployment(hotswapMode, cdkStackArtifact);
            // THEN
            expect(deployStackResult).not.toBeUndefined();
            expect(deployStackResult?.noOp).toEqual(true);
            expect(mock_sdk_1.mockLambdaClient).not.toHaveReceivedCommand(client_lambda_1.UpdateFunctionCodeCommand);
        }
    });
    (0, silent_1.silentTest)(`when it receives a non-hotswappable change that includes a code difference in a Lambda function, it does not call the updateLambdaCode()
        API in CLASSIC mode but does in HOTSWAP_ONLY mode`, async () => {
        // GIVEN
        setup.setCurrentCfnStackTemplate({
            Resources: {
                Func: {
                    Type: 'AWS::Lambda::Function',
                    Properties: {
                        Code: {
                            S3Bucket: 'current-bucket',
                            S3Key: 'current-key',
                        },
                        FunctionName: 'my-function',
                        PackageType: 'Zip',
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
                                S3Bucket: 'current-bucket',
                                S3Key: 'new-key',
                            },
                            FunctionName: 'my-function',
                            PackageType: 'Image',
                        },
                    },
                },
            },
        });
        if (hotswapMode === common_1.HotswapMode.FALL_BACK) {
            // WHEN
            const deployStackResult = await hotswapMockSdkProvider.tryHotswapDeployment(hotswapMode, cdkStackArtifact);
            // THEN
            expect(deployStackResult).toBeUndefined();
            expect(mock_sdk_1.mockLambdaClient).not.toHaveReceivedCommand(client_lambda_1.UpdateFunctionCodeCommand);
        }
        else if (hotswapMode === common_1.HotswapMode.HOTSWAP_ONLY) {
            // WHEN
            const deployStackResult = await hotswapMockSdkProvider.tryHotswapDeployment(hotswapMode, cdkStackArtifact);
            // THEN
            expect(deployStackResult).not.toBeUndefined();
            expect(mock_sdk_1.mockLambdaClient).toHaveReceivedCommandWith(client_lambda_1.UpdateFunctionCodeCommand, {
                FunctionName: 'my-function',
                S3Bucket: 'current-bucket',
                S3Key: 'new-key',
            });
        }
    });
    (0, silent_1.silentTest)('does not call the updateLambdaCode() API when a resource with type that is not AWS::Lambda::Function but has the same properties is changed', async () => {
        // GIVEN
        setup.setCurrentCfnStackTemplate({
            Resources: {
                Func: {
                    Type: 'AWS::NotLambda::NotAFunction',
                    Properties: {
                        Code: {
                            S3Bucket: 'current-bucket',
                            S3Key: 'current-key',
                        },
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
                        Type: 'AWS::NotLambda::NotAFunction',
                        Properties: {
                            Code: {
                                S3Bucket: 'current-bucket',
                                S3Key: 'new-key',
                            },
                        },
                        Metadata: {
                            'aws:asset:path': 'old-path',
                        },
                    },
                },
            },
        });
        if (hotswapMode === common_1.HotswapMode.FALL_BACK) {
            // WHEN
            const deployStackResult = await hotswapMockSdkProvider.tryHotswapDeployment(hotswapMode, cdkStackArtifact);
            // THEN
            expect(deployStackResult).toBeUndefined();
            expect(mock_sdk_1.mockLambdaClient).not.toHaveReceivedCommand(client_lambda_1.UpdateFunctionCodeCommand);
        }
        else if (hotswapMode === common_1.HotswapMode.HOTSWAP_ONLY) {
            // WHEN
            const deployStackResult = await hotswapMockSdkProvider.tryHotswapDeployment(hotswapMode, cdkStackArtifact);
            // THEN
            expect(deployStackResult).not.toBeUndefined();
            expect(deployStackResult?.noOp).toEqual(true);
            expect(mock_sdk_1.mockLambdaClient).not.toHaveReceivedCommand(client_lambda_1.UpdateFunctionCodeCommand);
        }
    });
    (0, silent_1.silentTest)('calls waiter after function code is updated with delay 1', async () => {
        // GIVEN
        setup.setCurrentCfnStackTemplate({
            Resources: {
                Func: {
                    Type: 'AWS::Lambda::Function',
                    Properties: {
                        Code: {
                            S3Bucket: 'current-bucket',
                            S3Key: 'current-key',
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
                                S3Bucket: 'current-bucket',
                                S3Key: 'new-key',
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
        expect(mock_sdk_1.mockLambdaClient).toHaveReceivedCommand(client_lambda_1.UpdateFunctionCodeCommand);
        expect(client_lambda_1.waitUntilFunctionUpdated).toHaveBeenCalledWith(expect.objectContaining({
            minDelay: 1,
            maxDelay: 1,
            maxWaitTime: 1 * 60,
        }), { FunctionName: 'my-function' });
    });
    (0, silent_1.silentTest)('calls waiter after function code is updated and VpcId is empty string with delay 1', async () => {
        // GIVEN
        mock_sdk_1.mockLambdaClient.on(client_lambda_1.UpdateFunctionCodeCommand).resolves({
            VpcConfig: {
                VpcId: '',
            },
        });
        setup.setCurrentCfnStackTemplate({
            Resources: {
                Func: {
                    Type: 'AWS::Lambda::Function',
                    Properties: {
                        Code: {
                            S3Bucket: 'current-bucket',
                            S3Key: 'current-key',
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
                                S3Bucket: 'current-bucket',
                                S3Key: 'new-key',
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
            minDelay: 1,
            maxDelay: 1,
            maxWaitTime: 1 * 60,
        }), { FunctionName: 'my-function' });
    });
    (0, silent_1.silentTest)('calls getFunction() after function code is updated on a VPC function with delay 5', async () => {
        // GIVEN
        mock_sdk_1.mockLambdaClient.on(client_lambda_1.UpdateFunctionCodeCommand).resolves({
            VpcConfig: {
                VpcId: 'abc',
            },
        });
        setup.setCurrentCfnStackTemplate({
            Resources: {
                Func: {
                    Type: 'AWS::Lambda::Function',
                    Properties: {
                        Code: {
                            S3Bucket: 'current-bucket',
                            S3Key: 'current-key',
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
                                S3Bucket: 'current-bucket',
                                S3Key: 'new-key',
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
    (0, silent_1.silentTest)('calls the updateLambdaConfiguration() API when it receives difference in Description field of a Lambda function', async () => {
        // GIVEN
        setup.setCurrentCfnStackTemplate({
            Resources: {
                Func: {
                    Type: 'AWS::Lambda::Function',
                    Properties: {
                        Code: {
                            S3Bucket: 's3-bucket',
                            S3Key: 's3-key',
                        },
                        FunctionName: 'my-function',
                        Description: 'Old Description',
                    },
                    Metadata: {
                        'aws:asset:path': 'asset-path',
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
                                S3Bucket: 's3-bucket',
                                S3Key: 's3-key',
                            },
                            FunctionName: 'my-function',
                            Description: 'New Description',
                        },
                        Metadata: {
                            'aws:asset:path': 'asset-path',
                        },
                    },
                },
            },
        });
        // WHEN
        const deployStackResult = await hotswapMockSdkProvider.tryHotswapDeployment(hotswapMode, cdkStackArtifact);
        // THEN
        expect(deployStackResult).not.toBeUndefined();
        expect(mock_sdk_1.mockLambdaClient).toHaveReceivedCommandWith(client_lambda_1.UpdateFunctionConfigurationCommand, {
            FunctionName: 'my-function',
            Description: 'New Description',
        });
    });
    (0, silent_1.silentTest)('calls the updateLambdaConfiguration() API when it receives difference in Environment field of a Lambda function', async () => {
        // GIVEN
        setup.setCurrentCfnStackTemplate({
            Resources: {
                Func: {
                    Type: 'AWS::Lambda::Function',
                    Properties: {
                        Code: {
                            S3Bucket: 's3-bucket',
                            S3Key: 's3-key',
                        },
                        FunctionName: 'my-function',
                        Environment: {
                            Variables: {
                                Key1: 'Value1',
                                Key2: 'Value2',
                            },
                        },
                    },
                    Metadata: {
                        'aws:asset:path': 'asset-path',
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
                                S3Bucket: 's3-bucket',
                                S3Key: 's3-key',
                            },
                            FunctionName: 'my-function',
                            Environment: {
                                Variables: {
                                    Key1: 'Value1',
                                    Key2: 'Value2',
                                    NewKey: 'NewValue',
                                },
                            },
                        },
                        Metadata: {
                            'aws:asset:path': 'asset-path',
                        },
                    },
                },
            },
        });
        // WHEN
        const deployStackResult = await hotswapMockSdkProvider.tryHotswapDeployment(hotswapMode, cdkStackArtifact);
        // THEN
        expect(deployStackResult).not.toBeUndefined();
        expect(mock_sdk_1.mockLambdaClient).toHaveReceivedCommandWith(client_lambda_1.UpdateFunctionConfigurationCommand, {
            FunctionName: 'my-function',
            Environment: {
                Variables: {
                    Key1: 'Value1',
                    Key2: 'Value2',
                    NewKey: 'NewValue',
                },
            },
        });
    });
    (0, silent_1.silentTest)('calls both updateLambdaCode() and updateLambdaConfiguration() API when it receives both code and configuration change', async () => {
        // GIVEN
        setup.setCurrentCfnStackTemplate({
            Resources: {
                Func: {
                    Type: 'AWS::Lambda::Function',
                    Properties: {
                        Code: {
                            S3Bucket: 'current-bucket',
                            S3Key: 'current-key',
                        },
                        FunctionName: 'my-function',
                        Description: 'Old Description',
                    },
                    Metadata: {
                        'aws:asset:path': 'asset-path',
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
                                S3Bucket: 'new-bucket',
                                S3Key: 'new-key',
                            },
                            FunctionName: 'my-function',
                            Description: 'New Description',
                        },
                        Metadata: {
                            'aws:asset:path': 'asset-path',
                        },
                    },
                },
            },
        });
        // WHEN
        const deployStackResult = await hotswapMockSdkProvider.tryHotswapDeployment(hotswapMode, cdkStackArtifact);
        // THEN
        expect(deployStackResult).not.toBeUndefined();
        expect(mock_sdk_1.mockLambdaClient).toHaveReceivedCommandWith(client_lambda_1.UpdateFunctionConfigurationCommand, {
            FunctionName: 'my-function',
            Description: 'New Description',
        });
        expect(mock_sdk_1.mockLambdaClient).toHaveReceivedCommandWith(client_lambda_1.UpdateFunctionCodeCommand, {
            FunctionName: 'my-function',
            S3Bucket: 'new-bucket',
            S3Key: 'new-key',
        });
    });
    (0, silent_1.silentTest)('Lambda hotswap works properly with changes of environment variables and description with tokens', async () => {
        // GIVEN
        setup.setCurrentCfnStackTemplate({
            Resources: {
                EventBus: {
                    Type: 'AWS::Events::EventBus',
                    Properties: {
                        Name: 'my-event-bus',
                    },
                },
                Func: {
                    Type: 'AWS::Lambda::Function',
                    Properties: {
                        Code: {
                            S3Bucket: 's3-bucket',
                            S3Key: 's3-key',
                        },
                        FunctionName: 'my-function',
                        Environment: {
                            Variables: {
                                token: { 'Fn::GetAtt': ['EventBus', 'Arn'] },
                                literal: 'oldValue',
                            },
                        },
                        Description: {
                            'Fn::Join': ['', ['oldValue', { 'Fn::GetAtt': ['EventBus', 'Arn'] }]],
                        },
                    },
                    Metadata: {
                        'aws:asset:path': 'asset-path',
                    },
                },
            },
        });
        setup.pushStackResourceSummaries(setup.stackSummaryOf('EventBus', 'AWS::Events::EventBus', 'my-event-bus'));
        const cdkStackArtifact = setup.cdkStackArtifactOf({
            template: {
                Resources: {
                    EventBus: {
                        Type: 'AWS::Events::EventBus',
                        Properties: {
                            Name: 'my-event-bus',
                        },
                    },
                    Func: {
                        Type: 'AWS::Lambda::Function',
                        Properties: {
                            Code: {
                                S3Bucket: 's3-bucket',
                                S3Key: 's3-key',
                            },
                            FunctionName: 'my-function',
                            Environment: {
                                Variables: {
                                    token: { 'Fn::GetAtt': ['EventBus', 'Arn'] },
                                    literal: 'newValue',
                                },
                            },
                            Description: {
                                'Fn::Join': ['', ['newValue', { 'Fn::GetAtt': ['EventBus', 'Arn'] }]],
                            },
                        },
                        Metadata: {
                            'aws:asset:path': 'asset-path',
                        },
                    },
                },
            },
        });
        // WHEN
        const deployStackResult = await hotswapMockSdkProvider.tryHotswapDeployment(hotswapMode, cdkStackArtifact);
        // THEN
        expect(deployStackResult).not.toBeUndefined();
        expect(mock_sdk_1.mockLambdaClient).toHaveReceivedCommandWith(client_lambda_1.UpdateFunctionConfigurationCommand, {
            FunctionName: 'my-function',
            Environment: {
                Variables: {
                    token: 'arn:swa:events:here:123456789012:event-bus/my-event-bus',
                    literal: 'newValue',
                },
            },
            Description: 'newValuearn:swa:events:here:123456789012:event-bus/my-event-bus',
        });
    });
    (0, silent_1.silentTest)('S3ObjectVersion is hotswappable', async () => {
        // GIVEN
        setup.setCurrentCfnStackTemplate({
            Resources: {
                Func: {
                    Type: 'AWS::Lambda::Function',
                    Properties: {
                        Code: {
                            S3Key: 'current-key',
                            S3ObjectVersion: 'current-obj',
                        },
                        FunctionName: 'my-function',
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
                                S3Key: 'new-key',
                                S3ObjectVersion: 'new-obj',
                            },
                            FunctionName: 'my-function',
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
            S3Key: 'new-key',
            S3ObjectVersion: 'new-obj',
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFtYmRhLWZ1bmN0aW9ucy1ob3Rzd2FwLWRlcGxveW1lbnRzLnRlc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJsYW1iZGEtZnVuY3Rpb25zLWhvdHN3YXAtZGVwbG95bWVudHMudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLDBEQUlnQztBQUNoQyw4Q0FBOEM7QUFDOUMsNERBQThEO0FBQzlELGtEQUF1RDtBQUN2RCw4Q0FBK0M7QUFFL0MsSUFBSSxDQUFDLElBQUksQ0FBQyx3QkFBd0IsRUFBRSxHQUFHLEVBQUU7SUFDdkMsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO0lBRTlELE9BQU87UUFDTCxHQUFHLFFBQVE7UUFDWCx3QkFBd0IsRUFBRSxJQUFJLENBQUMsRUFBRSxFQUFFO0tBQ3BDLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQztBQUVILElBQUksc0JBQW9ELENBQUM7QUFFekQsVUFBVSxDQUFDLEdBQUcsRUFBRTtJQUNkLHNCQUFzQixHQUFHLEtBQUssQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO0FBQ3JELENBQUMsQ0FBQyxDQUFDO0FBRUgsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLG9CQUFXLENBQUMsU0FBUyxFQUFFLG9CQUFXLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxXQUFXLEVBQUUsRUFBRTtJQUMxRixJQUFBLG1CQUFVLEVBQUMsb0VBQW9FLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDMUYsUUFBUTtRQUNSLE1BQU0sZ0JBQWdCLEdBQUcsS0FBSyxDQUFDLGtCQUFrQixDQUFDO1lBQ2hELFFBQVEsRUFBRTtnQkFDUixTQUFTLEVBQUU7b0JBQ1QsSUFBSSxFQUFFO3dCQUNKLElBQUksRUFBRSx1QkFBdUI7cUJBQzlCO2lCQUNGO2FBQ0Y7U0FDRixDQUFDLENBQUM7UUFFSCxJQUFJLFdBQVcsS0FBSyxvQkFBVyxDQUFDLFNBQVMs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ZUFBZSxFQUFFLFNBQVM7U0FDM0IsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7XG4gIFVwZGF0ZUZ1bmN0aW9uQ29kZUNvbW1hbmQsXG4gIFVwZGF0ZUZ1bmN0aW9uQ29uZmlndXJhdGlvbkNvbW1hbmQsXG4gIHdhaXRVbnRpbEZ1bmN0aW9uVXBkYXRlZCxcbn0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LWxhbWJkYSc7XG5pbXBvcnQgKiBhcyBzZXR1cCBmcm9tICcuL2hvdHN3YXAtdGVzdC1zZXR1cCc7XG5pbXBvcnQgeyBIb3Rzd2FwTW9kZSB9IGZyb20gJy4uLy4uLy4uL2xpYi9hcGkvaG90c3dhcC9jb21tb24nO1xuaW1wb3J0IHsgbW9ja0xhbWJkYUNsaWVudCB9IGZyb20gJy4uLy4uL3V0aWwvbW9jay1zZGsnO1xuaW1wb3J0IHsgc2lsZW50VGVzdCB9IGZyb20gJy4uLy4uL3V0aWwvc2lsZW50JztcblxuamVzdC5tb2NrKCdAYXdzLXNkay9jbGllbnQtbGFtYmRhJywgKCkgPT4ge1xuICBjb25zdCBvcmlnaW5hbCA9IGplc3QucmVxdWlyZUFjdHVhbCgnQGF3cy1zZGsvY2xpZW50LWxhbWJkYScpO1xuXG4gIHJldHVybiB7XG4gICAgLi4ub3JpZ2luYWwsXG4gICAgd2FpdFVudGlsRnVuY3Rpb25VcGRhdGVkOiBqZXN0LmZuKCksXG4gIH07XG59KTtcblxubGV0IGhvdHN3YXBNb2NrU2RrUHJvdmlkZXI6IHNldHVwLkhvdHN3YXBNb2NrU2RrUHJvdmlkZXI7XG5cbmJlZm9yZUVhY2goKCkgPT4ge1xuICBob3Rzd2FwTW9ja1Nka1Byb3ZpZGVyID0gc2V0dXAuc2V0dXBIb3Rzd2FwVGVzdHMoKTtcbn0pO1xuXG5kZXNjcmliZS5lYWNoKFtIb3Rzd2FwTW9kZS5GQUxMX0JBQ0ssIEhvdHN3YXBNb2RlLkhPVFNXQVBfT05MWV0pKCclcCBtb2RlJywgKGhvdHN3YXBNb2RlKSA9PiB7XG4gIHNpbGVudFRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gYSBuZXcgTGFtYmRhIGZ1bmN0aW9uIGlzIGFkZGVkIHRvIHRoZSBTdGFjaycsIGFzeW5jICgpID0+IHtcbiAgICAvLyBHSVZFTlxuICAgIGNvbnN0IGNka1N0YWNrQXJ0aWZhY3QgPSBzZXR1cC5jZGtTdGFja0FydGlmYWN0T2Yoe1xuICAgICAgdGVtcGxhdGU6IHtcbiAgICAgICAgUmVzb3VyY2VzOiB7XG4gICAgICAgICAgRnVuYzoge1xuICAgICAgICAgICAgVHlwZTogJ0FXUzo6TGFtYmRhOjpGdW5jdGlvbicsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBpZiAoaG90c3dhcE1vZGUgPT09IEhvdHN3YXBNb2RlLkZBTExfQkFDSykge1xuICAgICAgLy8gV0hFTlxuICAgICAgY29uc3QgZGVwbG95U3RhY2tSZXN1bHQgPSBhd2FpdCBob3Rzd2FwTW9ja1Nka1Byb3ZpZGVyLnRyeUhvdHN3YXBEZXBsb3ltZW50KGhvdHN3YXBNb2RlLCBjZGtTdGFja0FydGlmYWN0KTtcblxuICAgICAgLy8gVEhFTlxuICAgICAgZXhwZWN0KGRlcGxveVN0YWNrUmVzdWx0KS50b0JlVW5kZWZpbmVkKCk7XG4gICAgfSBlbHNlIGlmIChob3Rzd2FwTW9kZSA9PT0gSG90c3dhcE1vZGUuSE9UU1dBUF9PTkxZKSB7XG4gICAgICAvLyBXSEVOXG4gICAgICBjb25zdCBkZXBsb3lTdGFja1Jlc3VsdCA9IGF3YWl0IGhvdHN3YXBNb2NrU2RrUHJvdmlkZXIudHJ5SG90c3dhcERlcGxveW1lbnQoaG90c3dhcE1vZGUsIGNka1N0YWNrQXJ0aWZhY3QpO1xuXG4gICAgICAvLyBUSEVOXG4gICAgICBleHBlY3QoZGVwbG95U3RhY2tSZXN1bHQpLm5vdC50b0JlVW5kZWZpbmVkKCk7XG4gICAgICBleHBlY3QoZGVwbG95U3RhY2tSZXN1bHQ/Lm5vT3ApLnRvRXF1YWwodHJ1ZSk7XG4gICAgICBleHBlY3QobW9ja0xhbWJkYUNsaWVudCkubm90LnRvSGF2ZVJlY2VpdmVkQ29tbWFuZChVcGRhdGVGdW5jdGlvbkNvZGVDb21tYW5kKTtcbiAgICB9XG4gIH0pO1xuXG4gIHNpbGVudFRlc3QoXG4gICAgJ2NhbGxzIHRoZSB1cGRhdGVMYW1iZGFDb2RlKCkgQVBJIHdoZW4gaXQgcmVjZWl2ZXMgb25seSBhIGNvZGUgZGlmZmVyZW5jZSBpbiBhIExhbWJkYSBmdW5jdGlvbicsXG4gICAgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gR0lWRU5cbiAgICAgIHNldHVwLnNldEN1cnJlbnRDZm5TdGFja1RlbXBsYXRlKHtcbiAgICAgICAgUmVzb3VyY2VzOiB7XG4gICAgICAgICAgRnVuYzoge1xuICAgICAgICAgICAgVHlwZTogJ0FXUzo6TGFtYmRhOjpGdW5jdGlvbicsXG4gICAgICAgICAgICBQcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgICAgIENvZGU6IHtcbiAgICAgICAgICAgICAgICBTM0J1Y2tldDogJ2N1cnJlbnQtYnVja2V0JyxcbiAgICAgICAgICAgICAgICBTM0tleTogJ2N1cnJlbnQta2V5JyxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgRnVuY3Rpb25OYW1lOiAnbXktZnVuY3Rpb24nLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIE1ldGFkYXRhOiB7XG4gICAgICAgICAgICAgICdhd3M6YXNzZXQ6cGF0aCc6ICdvbGQtcGF0aCcsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICAgIGNvbnN0IGNka1N0YWNrQXJ0aWZhY3QgPSBzZXR1cC5jZGtTdGFja0FydGlmYWN0T2Yoe1xuICAgICAgICB0ZW1wbGF0ZToge1xuICAgICAgICAgIFJlc291cmNlczoge1xuICAgICAgICAgICAgRnVuYzoge1xuICAgICAgICAgICAgICBUeXBlOiAnQVdTOjpMYW1iZGE6OkZ1bmN0aW9uJyxcbiAgICAgICAgICAgICAgUHJvcGVydGllczoge1xuICAgICAgICAgICAgICAgIENvZGU6IHtcbiAgICAgICAgICAgICAgICAgIFMzQnVja2V0OiAnY3VycmVudC1idWNrZXQnLFxuICAgICAgICAgICAgICAgICAgUzNLZXk6ICduZXcta2V5JyxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIEZ1bmN0aW9uTmFtZTogJ215LWZ1bmN0aW9uJyxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgTWV0YWRhdGE6IHtcbiAgICAgICAgICAgICAgICAnYXdzOmFzc2V0OnBhdGgnOiAnbmV3LXBhdGgnLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSk7XG5cbiAgICAgIC8vIFdIRU5cbiAgICAgIGNvbnN0IGRlcGxveVN0YWNrUmVzdWx0ID0gYXdhaXQgaG90c3dhcE1vY2tTZGtQcm92aWRlci50cnlIb3Rzd2FwRGVwbG95bWVudChob3Rzd2FwTW9kZSwgY2RrU3RhY2tBcnRpZmFjdCk7XG5cbiAgICAgIC8vIFRIRU5cbiAgICAgIGV4cGVjdChkZXBsb3lTdGFja1Jlc3VsdCkubm90LnRvQmVVbmRlZmluZWQoKTtcbiAgICAgIGV4cGVjdChtb2NrTGFtYmRhQ2xpZW50KS50b0hhdmVSZWNlaXZlZENvbW1hbmRXaXRoKFVwZGF0ZUZ1bmN0aW9uQ29kZUNvbW1hbmQsIHtcbiAgICAgICAgRnVuY3Rpb25OYW1lOiAnbXktZnVuY3Rpb24nLFxuICAgICAgICBTM0J1Y2tldDogJ2N1cnJlbnQtYnVja2V0JyxcbiAgICAgICAgUzNLZXk6ICduZXcta2V5JyxcbiAgICAgIH0pO1xuICAgIH0sXG4gICk7XG5cbiAgc2lsZW50VGVzdChcbiAgICBcImNvcnJlY3RseSBldmFsdWF0ZXMgdGhlIGZ1bmN0aW9uJ3MgbmFtZSB3aGVuIGl0IHJlZmVyZW5jZXMgYSBkaWZmZXJlbnQgcmVzb3VyY2UgZnJvbSB0aGUgdGVtcGxhdGVcIixcbiAgICBhc3luYyAoKSA9PiB7XG4gICAgICAvLyBHSVZFTlxuICAgICAgc2V0dXAuc2V0Q3VycmVudENmblN0YWNrVGVtcGxhdGUoe1xuICAgICAgICBSZXNvdXJjZXM6IHtcbiAgICAgICAgICBCdWNrZXQ6IHtcbiAgICAgICAgICAgIFR5cGU6ICdBV1M6OlMzOjpCdWNrZXQnLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgRnVuYzoge1xuICAgICAgICAgICAgVHlwZTogJ0FXUzo6TGFtYmRhOjpGdW5jdGlvbicsXG4gICAgICAgICAgICBQcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgICAgIENvZGU6IHtcbiAgICAgICAgICAgICAgICBTM0J1Y2tldDogJ2N1cnJlbnQtYnVja2V0JyxcbiAgICAgICAgICAgICAgICBTM0tleTogJ2N1cnJlbnQta2V5JyxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgRnVuY3Rpb25OYW1lOiB7XG4gICAgICAgICAgICAgICAgJ0ZuOjpKb2luJzogWyctJywgWydsYW1iZGEnLCB7IFJlZjogJ0J1Y2tldCcgfSwgJ2Z1bmN0aW9uJ11dLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIE1ldGFkYXRhOiB7XG4gICAgICAgICAgICAgICdhd3M6YXNzZXQ6cGF0aCc6ICdvbGQtcGF0aCcsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICAgIHNldHVwLnB1c2hTdGFja1Jlc291cmNlU3VtbWFyaWVzKHNldHVwLnN0YWNrU3VtbWFyeU9mKCdCdWNrZXQnLCAnQVdTOjpTMzo6QnVja2V0JywgJ215YnVja2V0JykpO1xuICAgICAgY29uc3QgY2RrU3RhY2tBcnRpZmFjdCA9IHNldHVwLmNka1N0YWNrQXJ0aWZhY3RPZih7XG4gICAgICAgIHRlbXBsYXRlOiB7XG4gICAgICAgICAgUmVzb3VyY2VzOiB7XG4gICAgICAgICAgICBCdWNrZXQ6IHtcbiAgICAgICAgICAgICAgVHlwZTogJ0FXUzo6UzM6OkJ1Y2tldCcsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgRnVuYzoge1xuICAgICAgICAgICAgICBUeXBlOiAnQVdTOjpMYW1iZGE6OkZ1bmN0aW9uJyxcbiAgICAgICAgICAgICAgUHJvcGVydGllczoge1xuICAgICAgICAgICAgICAgIENvZGU6IHtcbiAgICAgICAgICAgICAgICAgIFMzQnVja2V0OiAnY3VycmVudC1idWNrZXQnLFxuICAgICAgICAgICAgICAgICAgUzNLZXk6ICduZXcta2V5JyxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIEZ1bmN0aW9uTmFtZToge1xuICAgICAgICAgICAgICAgICAgJ0ZuOjpKb2luJzogWyctJywgWydsYW1iZGEnLCB7IFJlZjogJ0J1Y2tldCcgfSwgJ2Z1bmN0aW9uJ11dLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIE1ldGFkYXRhOiB7XG4gICAgICAgICAgICAgICAgJ2F3czphc3NldDpwYXRoJzogJ29sZC1wYXRoJyxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBXSEVOXG4gICAgICBjb25zdCBkZXBsb3lTdGFja1Jlc3VsdCA9IGF3YWl0IGhvdHN3YXBNb2NrU2RrUHJvdmlkZXIudHJ5SG90c3dhcERlcGxveW1lbnQoaG90c3dhcE1vZGUsIGNka1N0YWNrQXJ0aWZhY3QpO1xuXG4gICAgICAvLyBUSEVOXG4gICAgICBleHBlY3QoZGVwbG95U3RhY2tSZXN1bHQpLm5vdC50b0JlVW5kZWZpbmVkKCk7XG4gICAgICBleHBlY3QobW9ja0xhbWJkYUNsaWVudCkudG9IYXZlUmVjZWl2ZWRDb21tYW5kV2l0aChVcGRhdGVGdW5jdGlvbkNvZGVDb21tYW5kLCB7XG4gICAgICAgIEZ1bmN0aW9uTmFtZTogJ2xhbWJkYS1teWJ1Y2tldC1mdW5jdGlvbicsXG4gICAgICAgIFMzQnVja2V0OiAnY3VycmVudC1idWNrZXQnLFxuICAgICAgICBTM0tleTogJ25ldy1rZXknLFxuICAgICAgfSk7XG4gICAgfSxcbiAgKTtcblxuICBzaWxlbnRUZXN0KFxuICAgIFwiY29ycmVjdGx5IGZhbGxzIGJhY2sgdG8gdGFraW5nIHRoZSBmdW5jdGlvbidzIG5hbWUgZnJvbSB0aGUgY3VycmVudCBzdGFjayBpZiBpdCBjYW4ndCBldmFsdWF0ZSBpdCBpbiB0aGUgdGVtcGxhdGVcIixcbiAgICBhc3luYyAoKSA9PiB7XG4gICAgICAvLyBHSVZFTlxuICAgICAgc2V0dXAuc2V0Q3VycmVudENmblN0YWNrVGVtcGxhdGUoe1xuICAgICAgICBQYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgUGFyYW0xOiB7IFR5cGU6ICdTdHJpbmcnIH0sXG4gICAgICAgICAgQXNzZXRCdWNrZXRQYXJhbTogeyBUeXBlOiAnU3RyaW5nJyB9LFxuICAgICAgICB9LFxuICAgICAgICBSZXNvdXJjZXM6IHtcbiAgICAgICAgICBGdW5jOiB7XG4gICAgICAgICAgICBUeXBlOiAnQVdTOjpMYW1iZGE6OkZ1bmN0aW9uJyxcbiAgICAgICAgICAgIFByb3BlcnRpZXM6IHtcbiAgICAgICAgICAgICAgQ29kZToge1xuICAgICAgICAgICAgICAgIFMzQnVja2V0OiB7IFJlZjogJ0Fzc2V0QnVja2V0UGFyYW0nIH0sXG4gICAgICAgICAgICAgICAgUzNLZXk6ICdjdXJyZW50LWtleScsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIEZ1bmN0aW9uTmFtZTogeyBSZWY6ICdQYXJhbTEnIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgTWV0YWRhdGE6IHtcbiAgICAgICAgICAgICAgJ2F3czphc3NldDpwYXRoJzogJ29sZC1wYXRoJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgICAgc2V0dXAucHVzaFN0YWNrUmVzb3VyY2VTdW1tYXJpZXMoc2V0dXAuc3RhY2tTdW1tYXJ5T2YoJ0Z1bmMnLCAnQVdTOjpMYW1iZGE6OkZ1bmN0aW9uJywgJ215LWZ1bmN0aW9uJykpO1xuICAgICAgY29uc3QgY2RrU3RhY2tBcnRpZmFjdCA9IHNldHVwLmNka1N0YWNrQXJ0aWZhY3RPZih7XG4gICAgICAgIHRlbXBsYXRlOiB7XG4gICAgICAgICAgUGFyYW1ldGVyczoge1xuICAgICAgICAgICAgUGFyYW0xOiB7IFR5cGU6ICdTdHJpbmcnIH0sXG4gICAgICAgICAgICBBc3NldEJ1Y2tldFBhcmFtOiB7IFR5cGU6ICdTdHJpbmcnIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICBSZXNvdXJjZXM6IHtcbiAgICAgICAgICAgIEZ1bmM6IHtcbiAgICAgICAgICAgICAgVHlwZTogJ0FXUzo6TGFtYmRhOjpGdW5jdGlvbicsXG4gICAgICAgICAgICAgIFByb3BlcnRpZXM6IHtcbiAgICAgICAgICAgICAgICBDb2RlOiB7XG4gICAgICAgICAgICAgICAgICBTM0J1Y2tldDogeyBSZWY6ICdBc3NldEJ1Y2tldFBhcmFtJyB9LFxuICAgICAgICAgICAgICAgICAgUzNLZXk6ICduZXcta2V5JyxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIEZ1bmN0aW9uTmFtZTogeyBSZWY6ICdQYXJhbTEnIH0sXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIE1ldGFkYXRhOiB7XG4gICAgICAgICAgICAgICAgJ2F3czphc3NldDpwYXRoJzogJ25ldy1wYXRoJyxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBXSEVOXG4gICAgICBjb25zdCBkZXBsb3lTdGFja1Jlc3VsdCA9IGF3YWl0IGhvdHN3YXBNb2NrU2RrUHJvdmlkZXIudHJ5SG90c3dhcERlcGxveW1lbnQoaG90c3dhcE1vZGUsIGNka1N0YWNrQXJ0aWZhY3QsIHtcbiAgICAgICAgQXNzZXRCdWNrZXRQYXJhbTogJ2Fzc2V0LWJ1Y2tldCcsXG4gICAgICB9KTtcblxuICAgICAgLy8gVEhFTlxuICAgICAgZXhwZWN0KGRlcGxveVN0YWNrUmVzdWx0KS5ub3QudG9CZVVuZGVmaW5lZCgpO1xuICAgICAgZXhwZWN0KG1vY2tMYW1iZGFDbGllbnQpLnRvSGF2ZVJlY2VpdmVkQ29tbWFuZFdpdGgoVXBkYXRlRnVuY3Rpb25Db2RlQ29tbWFuZCwge1xuICAgICAgICBGdW5jdGlvbk5hbWU6ICdteS1mdW5jdGlvbicsXG4gICAgICAgIFMzQnVja2V0OiAnYXNzZXQtYnVja2V0JyxcbiAgICAgICAgUzNLZXk6ICduZXcta2V5JyxcbiAgICAgIH0pO1xuICAgIH0sXG4gICk7XG5cbiAgc2lsZW50VGVzdChcbiAgICBcIndpbGwgbm90IHBlcmZvcm0gYSBob3Rzd2FwIGRlcGxveW1lbnQgaWYgaXQgY2Fubm90IGZpbmQgYSBSZWYgdGFyZ2V0IChvdXRzaWRlIHRoZSBmdW5jdGlvbidzIG5hbWUpXCIsXG4gICAgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gR0lWRU5cbiAgICAgIHNldHVwLnNldEN1cnJlbnRDZm5TdGFja1RlbXBsYXRlKHtcbiAgICAgICAgUGFyYW1ldGVyczoge1xuICAgICAgICAgIFBhcmFtMTogeyBUeXBlOiAnU3RyaW5nJyB9LFxuICAgICAgICB9LFxuICAgICAgICBSZXNvdXJjZXM6IHtcbiAgICAgICAgICBGdW5jOiB7XG4gICAgICAgICAgICBUeXBlOiAnQVdTOjpMYW1iZGE6OkZ1bmN0aW9uJyxcbiAgICAgICAgICAgIFByb3BlcnRpZXM6IHtcbiAgICAgICAgICAgICAgQ29kZToge1xuICAgICAgICAgICAgICAgIFMzQnVja2V0OiB7ICdGbjo6U3ViJzogJyR7UGFyYW0xfScgfSxcbiAgICAgICAgICAgICAgICBTM0tleTogJ2N1cnJlbnQta2V5JyxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBNZXRhZGF0YToge1xuICAgICAgICAgICAgICAnYXdzOmFzc2V0OnBhdGgnOiAnb2xkLXBhdGgnLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgICBzZXR1cC5wdXNoU3RhY2tSZXNvdXJjZVN1bW1hcmllcyhzZXR1cC5zdGFja1N1bW1hcnlPZignRnVuYycsICdBV1M6OkxhbWJkYTo6RnVuY3Rpb24nLCAnbXktZnVuYycpKTtcbiAgICAgIGNvbnN0IGNka1N0YWNrQXJ0aWZhY3QgPSBzZXR1cC5jZGtTdGFja0FydGlmYWN0T2Yoe1xuICAgICAgICB0ZW1wbGF0ZToge1xuICAgICAgICAgIFBhcmFtZXRlcnM6IHtcbiAgICAgICAgICAgIFBhcmFtMTogeyBUeXBlOiAnU3RyaW5nJyB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAgUmVzb3VyY2VzOiB7XG4gICAgICAgICAgICBGdW5jOiB7XG4gICAgICAgICAgICAgIFR5cGU6ICdBV1M6OkxhbWJkYTo6RnVuY3Rpb24nLFxuICAgICAgICAgICAgICBQcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgICAgICAgQ29kZToge1xuICAgICAgICAgICAgICAgICAgUzNCdWNrZXQ6IHsgJ0ZuOjpTdWInOiAnJHtQYXJhbTF9JyB9LFxuICAgICAgICAgICAgICAgICAgUzNLZXk6ICduZXcta2V5JyxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICBNZXRhZGF0YToge1xuICAgICAgICAgICAgICAgICdhd3M6YXNzZXQ6cGF0aCc6ICduZXctcGF0aCcsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgLy8gVEhFTlxuICAgICAgYXdhaXQgZXhwZWN0KCgpID0+IGhvdHN3YXBNb2NrU2RrUHJvdmlkZXIudHJ5SG90c3dhcERlcGxveW1lbnQoaG90c3dhcE1vZGUsIGNka1N0YWNrQXJ0aWZhY3QpKS5yZWplY3RzLnRvVGhyb3coXG4gICAgICAgIC9QYXJhbWV0ZXIgb3IgcmVzb3VyY2UgJ1BhcmFtMScgY291bGQgbm90IGJlIGZvdW5kIGZvciBldmFsdWF0aW9uLyxcbiAgICAgICk7XG4gICAgfSxcbiAgKTtcblxuICBzaWxlbnRUZXN0KFxuICAgIFwid2lsbCBub3QgcGVyZm9ybSBhIGhvdHN3YXAgZGVwbG95bWVudCBpZiBpdCBkb2Vzbid0IGtub3cgaG93IHRvIGhhbmRsZSBhIHNwZWNpZmljIGF0dHJpYnV0ZSAob3V0c2lkZSB0aGUgZnVuY3Rpb24ncyBuYW1lKVwiLFxuICAgIGFzeW5jICgpID0+IHtcbiAgICAgIC8vIEdJVkVOXG4gICAgICBzZXR1cC5zZXRDdXJyZW50Q2ZuU3RhY2tUZW1wbGF0ZSh7XG4gICAgICAgIFJlc291cmNlczoge1xuICAgICAgICAgIEJ1Y2tldDoge1xuICAgICAgICAgICAgVHlwZTogJ0FXUzo6UzM6OkJ1Y2tldCcsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBGdW5jOiB7XG4gICAgICAgICAgICBUeXBlOiAnQVdTOjpMYW1iZGE6OkZ1bmN0aW9uJyxcbiAgICAgICAgICAgIFByb3BlcnRpZXM6IHtcbiAgICAgICAgICAgICAgQ29kZToge1xuICAgICAgICAgICAgICAgIFMzQnVja2V0OiB7ICdGbjo6R2V0QXR0JzogWydCdWNrZXQnLCAnVW5rbm93bkF0dHJpYnV0ZSddIH0sXG4gICAgICAgICAgICAgICAgUzNLZXk6ICdjdXJyZW50LWtleScsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgTWV0YWRhdGE6IHtcbiAgICAgICAgICAgICAgJ2F3czphc3NldDpwYXRoJzogJ29sZC1wYXRoJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgICAgc2V0dXAucHVzaFN0YWNrUmVzb3VyY2VTdW1tYXJpZXMoXG4gICAgICAgIHNldHVwLnN0YWNrU3VtbWFyeU9mKCdGdW5jJywgJ0FXUzo6TGFtYmRhOjpGdW5jdGlvbicsICdteS1mdW5jJyksXG4gICAgICAgIHNldHVwLnN0YWNrU3VtbWFyeU9mKCdCdWNrZXQnLCAnQVdTOjpTMzo6QnVja2V0JywgJ215LWJ1Y2tldCcpLFxuICAgICAgKTtcbiAgICAgIGNvbnN0IGNka1N0YWNrQXJ0aWZhY3QgPSBzZXR1cC5jZGtTdGFja0FydGlmYWN0T2Yoe1xuICAgICAgICB0ZW1wbGF0ZToge1xuICAgICAgICAgIFJlc291cmNlczoge1xuICAgICAgICAgICAgQnVja2V0OiB7XG4gICAgICAgICAgICAgIFR5cGU6ICdBV1M6OlMzOjpCdWNrZXQnLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIEZ1bmM6IHtcbiAgICAgICAgICAgICAgVHlwZTogJ0FXUzo6TGFtYmRhOjpGdW5jdGlvbicsXG4gICAgICAgICAgICAgIFByb3BlcnRpZXM6IHtcbiAgICAgICAgICAgICAgICBDb2RlOiB7XG4gICAgICAgICAgICAgICAgICBTM0J1Y2tldDogeyAnRm46OkdldEF0dCc6IFsnQnVja2V0JywgJ1Vua25vd25BdHRyaWJ1dGUnXSB9LFxuICAgICAgICAgICAgICAgICAgUzNLZXk6ICduZXcta2V5JyxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICBNZXRhZGF0YToge1xuICAgICAgICAgICAgICAgICdhd3M6YXNzZXQ6cGF0aCc6ICduZXctcGF0aCcsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgLy8gVEhFTlxuICAgICAgYXdhaXQgZXhwZWN0KCgpID0+IGhvdHN3YXBNb2NrU2RrUHJvdmlkZXIudHJ5SG90c3dhcERlcGxveW1lbnQoaG90c3dhcE1vZGUsIGNka1N0YWNrQXJ0aWZhY3QpKS5yZWplY3RzLnRvVGhyb3coXG4gICAgICAgIFwiV2UgZG9uJ3Qgc3VwcG9ydCB0aGUgJ1Vua25vd25BdHRyaWJ1dGUnIGF0dHJpYnV0ZSBvZiB0aGUgJ0FXUzo6UzM6OkJ1Y2tldCcgcmVzb3VyY2UuIFRoaXMgaXMgYSBDREsgbGltaXRhdGlvbi4gUGxlYXNlIHJlcG9ydCBpdCBhdCBodHRwczovL2dpdGh1Yi5jb20vYXdzL2F3cy1jZGsvaXNzdWVzL25ldy9jaG9vc2VcIixcbiAgICAgICk7XG4gICAgfSxcbiAgKTtcblxuICBzaWxlbnRUZXN0KFxuICAgICdjYWxscyB0aGUgdXBkYXRlTGFtYmRhQ29kZSgpIEFQSSB3aGVuIGl0IHJlY2VpdmVzIGEgY29kZSBkaWZmZXJlbmNlIGluIGEgTGFtYmRhIGZ1bmN0aW9uIHdpdGggbm8gbmFtZScsXG4gICAgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gR0lWRU5cbiAgICAgIHNldHVwLnNldEN1cnJlbnRDZm5TdGFja1RlbXBsYXRlKHtcbiAgICAgICAgUmVzb3VyY2VzOiB7XG4gICAgICAgICAgRnVuYzoge1xuICAgICAgICAgICAgVHlwZTogJ0FXUzo6TGFtYmRhOjpGdW5jdGlvbicsXG4gICAgICAgICAgICBQcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgICAgIENvZGU6IHtcbiAgICAgICAgICAgICAgICBTM0J1Y2tldDogJ2N1cnJlbnQtYnVja2V0JyxcbiAgICAgICAgICAgICAgICBTM0tleTogJ2N1cnJlbnQta2V5JyxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBNZXRhZGF0YToge1xuICAgICAgICAgICAgICAnYXdzOmFzc2V0OnBhdGgnOiAnY3VycmVudC1wYXRoJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgICAgY29uc3QgY2RrU3RhY2tBcnRpZmFjdCA9IHNldHVwLmNka1N0YWNrQXJ0aWZhY3RPZih7XG4gICAgICAgIHRlbXBsYXRlOiB7XG4gICAgICAgICAgUmVzb3VyY2VzOiB7XG4gICAgICAgICAgICBGdW5jOiB7XG4gICAgICAgICAgICAgIFR5cGU6ICdBV1M6OkxhbWJkYTo6RnVuY3Rpb24nLFxuICAgICAgICAgICAgICBQcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgICAgICAgQ29kZToge1xuICAgICAgICAgICAgICAgICAgUzNCdWNrZXQ6ICdjdXJyZW50LWJ1Y2tldCcsXG4gICAgICAgICAgICAgICAgICBTM0tleTogJ25ldy1rZXknLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIE1ldGFkYXRhOiB7XG4gICAgICAgICAgICAgICAgJ2F3czphc3NldDpwYXRoJzogJ2N1cnJlbnQtcGF0aCcsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgLy8gV0hFTlxuICAgICAgc2V0dXAucHVzaFN0YWNrUmVzb3VyY2VTdW1tYXJpZXMoXG4gICAgICAgIHNldHVwLnN0YWNrU3VtbWFyeU9mKCdGdW5jJywgJ0FXUzo6TGFtYmRhOjpGdW5jdGlvbicsICdtb2NrLWZ1bmN0aW9uLXJlc291cmNlLWlkJyksXG4gICAgICApO1xuICAgICAgY29uc3QgZGVwbG95U3RhY2tSZXN1bHQgPSBhd2FpdCBob3Rzd2FwTW9ja1Nka1Byb3ZpZGVyLnRyeUhvdHN3YXBEZXBsb3ltZW50KGhvdHN3YXBNb2RlLCBjZGtTdGFja0FydGlmYWN0KTtcblxuICAgICAgLy8gVEhFTlxuICAgICAgZXhwZWN0KGRlcGxveVN0YWNrUmVzdWx0KS5ub3QudG9CZVVuZGVmaW5lZCgpO1xuICAgICAgZXhwZWN0KG1vY2tMYW1iZGFDbGllbnQpLnRvSGF2ZVJlY2VpdmVkQ29tbWFuZFdpdGgoVXBkYXRlRnVuY3Rpb25Db2RlQ29tbWFuZCwge1xuICAgICAgICBGdW5jdGlvbk5hbWU6ICdtb2NrLWZ1bmN0aW9uLXJlc291cmNlLWlkJyxcbiAgICAgICAgUzNCdWNrZXQ6ICdjdXJyZW50LWJ1Y2tldCcsXG4gICAgICAgIFMzS2V5OiAnbmV3LWtleScsXG4gICAgICB9KTtcbiAgICB9LFxuICApO1xuXG4gIHNpbGVudFRlc3QoXG4gICAgJ2RvZXMgbm90IGNhbGwgdGhlIHVwZGF0ZUxhbWJkYUNvZGUoKSBBUEkgd2hlbiBpdCByZWNlaXZlcyBhIGNoYW5nZSB0aGF0IGlzIG5vdCBhIGNvZGUgZGlmZmVyZW5jZSBpbiBhIExhbWJkYSBmdW5jdGlvbicsXG4gICAgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gR0lWRU5cbiAgICAgIHNldHVwLnNldEN1cnJlbnRDZm5TdGFja1RlbXBsYXRlKHtcbiAgICAgICAgUmVzb3VyY2VzOiB7XG4gICAgICAgICAgRnVuYzoge1xuICAgICAgICAgICAgVHlwZTogJ0FXUzo6TGFtYmRhOjpGdW5jdGlvbicsXG4gICAgICAgICAgICBQcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgICAgIENvZGU6IHtcbiAgICAgICAgICAgICAgICBTM0J1Y2tldDogJ2N1cnJlbnQtYnVja2V0JyxcbiAgICAgICAgICAgICAgICBTM0tleTogJ2N1cnJlbnQta2V5JyxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgUGFja2FnZVR5cGU6ICdaaXAnLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgICBjb25zdCBjZGtTdGFja0FydGlmYWN0ID0gc2V0dXAuY2RrU3RhY2tBcnRpZmFjdE9mKHtcbiAgICAgICAgdGVtcGxhdGU6IHtcbiAgICAgICAgICBSZXNvdXJjZXM6IHtcbiAgICAgICAgICAgIEZ1bmM6IHtcbiAgICAgICAgICAgICAgVHlwZTogJ0FXUzo6TGFtYmRhOjpGdW5jdGlvbicsXG4gICAgICAgICAgICAgIFByb3BlcnRpZXM6IHtcbiAgICAgICAgICAgICAgICBDb2RlOiB7XG4gICAgICAgICAgICAgICAgICBTM0J1Y2tldDogJ2N1cnJlbnQtYnVja2V0JyxcbiAgICAgICAgICAgICAgICAgIFMzS2V5OiAnY3VycmVudC1rZXknLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgUGFja2FnZVR5cGU6ICdJbWFnZScsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgaWYgKGhvdHN3YXBNb2RlID09PSBIb3Rzd2FwTW9kZS5GQUxMX0JBQ0spIHtcbiAgICAgICAgLy8gV0hFTlxuICAgICAgICBjb25zdCBkZXBsb3lTdGFja1Jlc3VsdCA9IGF3YWl0IGhvdHN3YXBNb2NrU2RrUHJvdmlkZXIudHJ5SG90c3dhcERlcGxveW1lbnQoaG90c3dhcE1vZGUsIGNka1N0YWNrQXJ0aWZhY3QpO1xuXG4gICAgICAgIC8vIFRIRU5cbiAgICAgICAgZXhwZWN0KGRlcGxveVN0YWNrUmVzdWx0KS50b0JlVW5kZWZpbmVkKCk7XG4gICAgICAgIGV4cGVjdChtb2NrTGFtYmRhQ2xpZW50KS5ub3QudG9IYXZlUmVjZWl2ZWRDb21tYW5kKFVwZGF0ZUZ1bmN0aW9uQ29kZUNvbW1hbmQpO1xuICAgICAgfSBlbHNlIGlmIChob3Rzd2FwTW9kZSA9PT0gSG90c3dhcE1vZGUuSE9UU1dBUF9PTkxZKSB7XG4gICAgICAgIC8vIFdIRU5cbiAgICAgICAgY29uc3QgZGVwbG95U3RhY2tSZXN1bHQgPSBhd2FpdCBob3Rzd2FwTW9ja1Nka1Byb3ZpZGVyLnRyeUhvdHN3YXBEZXBsb3ltZW50KGhvdHN3YXBNb2RlLCBjZGtTdGFja0FydGlmYWN0KTtcblxuICAgICAgICAvLyBUSEVOXG4gICAgICAgIGV4cGVjdChkZXBsb3lTdGFja1Jlc3VsdCkubm90LnRvQmVVbmRlZmluZWQoKTtcbiAgICAgICAgZXhwZWN0KGRlcGxveVN0YWNrUmVzdWx0Py5ub09wKS50b0VxdWFsKHRydWUpO1xuICAgICAgICBleHBlY3QobW9ja0xhbWJkYUNsaWVudCkubm90LnRvSGF2ZVJlY2VpdmVkQ29tbWFuZChVcGRhdGVGdW5jdGlvbkNvZGVDb21tYW5kKTtcbiAgICAgIH1cbiAgICB9LFxuICApO1xuXG4gIHNpbGVudFRlc3QoXG4gICAgYHdoZW4gaXQgcmVjZWl2ZXMgYSBub24taG90c3dhcHBhYmxlIGNoYW5nZSB0aGF0IGluY2x1ZGVzIGEgY29kZSBkaWZmZXJlbmNlIGluIGEgTGFtYmRhIGZ1bmN0aW9uLCBpdCBkb2VzIG5vdCBjYWxsIHRoZSB1cGRhdGVMYW1iZGFDb2RlKClcbiAgICAgICAgQVBJIGluIENMQVNTSUMgbW9kZSBidXQgZG9lcyBpbiBIT1RTV0FQX09OTFkgbW9kZWAsXG4gICAgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gR0lWRU5cbiAgICAgIHNldHVwLnNldEN1cnJlbnRDZm5TdGFja1RlbXBsYXRlKHtcbiAgICAgICAgUmVzb3VyY2VzOiB7XG4gICAgICAgICAgRnVuYzoge1xuICAgICAgICAgICAgVHlwZTogJ0FXUzo6TGFtYmRhOjpGdW5jdGlvbicsXG4gICAgICAgICAgICBQcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgICAgIENvZGU6IHtcbiAgICAgICAgICAgICAgICBTM0J1Y2tldDogJ2N1cnJlbnQtYnVja2V0JyxcbiAgICAgICAgICAgICAgICBTM0tleTogJ2N1cnJlbnQta2V5JyxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgRnVuY3Rpb25OYW1lOiAnbXktZnVuY3Rpb24nLFxuICAgICAgICAgICAgICBQYWNrYWdlVHlwZTogJ1ppcCcsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICAgIGNvbnN0IGNka1N0YWNrQXJ0aWZhY3QgPSBzZXR1cC5jZGtTdGFja0FydGlmYWN0T2Yoe1xuICAgICAgICB0ZW1wbGF0ZToge1xuICAgICAgICAgIFJlc291cmNlczoge1xuICAgICAgICAgICAgRnVuYzoge1xuICAgICAgICAgICAgICBUeXBlOiAnQVdTOjpMYW1iZGE6OkZ1bmN0aW9uJyxcbiAgICAgICAgICAgICAgUHJvcGVydGllczoge1xuICAgICAgICAgICAgICAgIENvZGU6IHtcbiAgICAgICAgICAgICAgICAgIFMzQnVja2V0OiAnY3VycmVudC1idWNrZXQnLFxuICAgICAgICAgICAgICAgICAgUzNLZXk6ICduZXcta2V5JyxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIEZ1bmN0aW9uTmFtZTogJ215LWZ1bmN0aW9uJyxcbiAgICAgICAgICAgICAgICBQYWNrYWdlVHlwZTogJ0ltYWdlJyxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICBpZiAoaG90c3dhcE1vZGUgPT09IEhvdHN3YXBNb2RlLkZBTExfQkFDSykge1xuICAgICAgICAvLyBXSEVOXG4gICAgICAgIGNvbnN0IGRlcGxveVN0YWNrUmVzdWx0ID0gYXdhaXQgaG90c3dhcE1vY2tTZGtQcm92aWRlci50cnlIb3Rzd2FwRGVwbG95bWVudChob3Rzd2FwTW9kZSwgY2RrU3RhY2tBcnRpZmFjdCk7XG5cbiAgICAgICAgLy8gVEhFTlxuICAgICAgICBleHBlY3QoZGVwbG95U3RhY2tSZXN1bHQpLnRvQmVVbmRlZmluZWQoKTtcbiAgICAgICAgZXhwZWN0KG1vY2tMYW1iZGFDbGllbnQpLm5vdC50b0hhdmVSZWNlaXZlZENvbW1hbmQoVXBkYXRlRnVuY3Rpb25Db2RlQ29tbWFuZCk7XG4gICAgICB9IGVsc2UgaWYgKGhvdHN3YXBNb2RlID09PSBIb3Rzd2FwTW9kZS5IT1RTV0FQX09OTFkpIHtcbiAgICAgICAgLy8gV0hFTlxuICAgICAgICBjb25zdCBkZXBsb3lTdGFja1Jlc3VsdCA9IGF3YWl0IGhvdHN3YXBNb2NrU2RrUHJvdmlkZXIudHJ5SG90c3dhcERlcGxveW1lbnQoaG90c3dhcE1vZGUsIGNka1N0YWNrQXJ0aWZhY3QpO1xuXG4gICAgICAgIC8vIFRIRU5cbiAgICAgICAgZXhwZWN0KGRlcGxveVN0YWNrUmVzdWx0KS5ub3QudG9CZVVuZGVmaW5lZCgpO1xuICAgICAgICBleHBlY3QobW9ja0xhbWJkYUNsaWVudCkudG9IYXZlUmVjZWl2ZWRDb21tYW5kV2l0aChVcGRhdGVGdW5jdGlvbkNvZGVDb21tYW5kLCB7XG4gICAgICAgICAgRnVuY3Rpb25OYW1lOiAnbXktZnVuY3Rpb24nLFxuICAgICAgICAgIFMzQnVja2V0OiAnY3VycmVudC1idWNrZXQnLFxuICAgICAgICAgIFMzS2V5OiAnbmV3LWtleScsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0sXG4gICk7XG5cbiAgc2lsZW50VGVzdChcbiAgICAnZG9lcyBub3QgY2FsbCB0aGUgdXBkYXRlTGFtYmRhQ29kZSgpIEFQSSB3aGVuIGEgcmVzb3VyY2Ugd2l0aCB0eXBlIHRoYXQgaXMgbm90IEFXUzo6TGFtYmRhOjpGdW5jdGlvbiBidXQgaGFzIHRoZSBzYW1lIHByb3BlcnRpZXMgaXMgY2hhbmdlZCcsXG4gICAgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gR0lWRU5cbiAgICAgIHNldHVwLnNldEN1cnJlbnRDZm5TdGFja1RlbXBsYXRlKHtcbiAgICAgICAgUmVzb3VyY2VzOiB7XG4gICAgICAgICAgRnVuYzoge1xuICAgICAgICAgICAgVHlwZTogJ0FXUzo6Tm90TGFtYmRhOjpOb3RBRnVuY3Rpb24nLFxuICAgICAgICAgICAgUHJvcGVydGllczoge1xuICAgICAgICAgICAgICBDb2RlOiB7XG4gICAgICAgICAgICAgICAgUzNCdWNrZXQ6ICdjdXJyZW50LWJ1Y2tldCcsXG4gICAgICAgICAgICAgICAgUzNLZXk6ICdjdXJyZW50LWtleScsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgTWV0YWRhdGE6IHtcbiAgICAgICAgICAgICAgJ2F3czphc3NldDpwYXRoJzogJ29sZC1wYXRoJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgICAgY29uc3QgY2RrU3RhY2tBcnRpZmFjdCA9IHNldHVwLmNka1N0YWNrQXJ0aWZhY3RPZih7XG4gICAgICAgIHRlbXBsYXRlOiB7XG4gICAgICAgICAgUmVzb3VyY2VzOiB7XG4gICAgICAgICAgICBGdW5jOiB7XG4gICAgICAgICAgICAgIFR5cGU6ICdBV1M6Ok5vdExhbWJkYTo6Tm90QUZ1bmN0aW9uJyxcbiAgICAgICAgICAgICAgUHJvcGVydGllczoge1xuICAgICAgICAgICAgICAgIENvZGU6IHtcbiAgICAgICAgICAgICAgICAgIFMzQnVja2V0OiAnY3VycmVudC1idWNrZXQnLFxuICAgICAgICAgICAgICAgICAgUzNLZXk6ICduZXcta2V5JyxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICBNZXRhZGF0YToge1xuICAgICAgICAgICAgICAgICdhd3M6YXNzZXQ6cGF0aCc6ICdvbGQtcGF0aCcsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgaWYgKGhvdHN3YXBNb2RlID09PSBIb3Rzd2FwTW9kZS5GQUxMX0JBQ0spIHtcbiAgICAgICAgLy8gV0hFTlxuICAgICAgICBjb25zdCBkZXBsb3lTdGFja1Jlc3VsdCA9IGF3YWl0IGhvdHN3YXBNb2NrU2RrUHJvdmlkZXIudHJ5SG90c3dhcERlcGxveW1lbnQoaG90c3dhcE1vZGUsIGNka1N0YWNrQXJ0aWZhY3QpO1xuXG4gICAgICAgIC8vIFRIRU5cbiAgICAgICAgZXhwZWN0KGRlcGxveVN0YWNrUmVzdWx0KS50b0JlVW5kZWZpbmVkKCk7XG4gICAgICAgIGV4cGVjdChtb2NrTGFtYmRhQ2xpZW50KS5ub3QudG9IYXZlUmVjZWl2ZWRDb21tYW5kKFVwZGF0ZUZ1bmN0aW9uQ29kZUNvbW1hbmQpO1xuICAgICAgfSBlbHNlIGlmIChob3Rzd2FwTW9kZSA9PT0gSG90c3dhcE1vZGUuSE9UU1dBUF9PTkxZKSB7XG4gICAgICAgIC8vIFdIRU5cbiAgICAgICAgY29uc3QgZGVwbG95U3RhY2tSZXN1bHQgPSBhd2FpdCBob3Rzd2FwTW9ja1Nka1Byb3ZpZGVyLnRyeUhvdHN3YXBEZXBsb3ltZW50KGhvdHN3YXBNb2RlLCBjZGtTdGFja0FydGlmYWN0KTtcblxuICAgICAgICAvLyBUSEVOXG4gICAgICAgIGV4cGVjdChkZXBsb3lTdGFja1Jlc3VsdCkubm90LnRvQmVVbmRlZmluZWQoKTtcbiAgICAgICAgZXhwZWN0KGRlcGxveVN0YWNrUmVzdWx0Py5ub09wKS50b0VxdWFsKHRydWUpO1xuICAgICAgICBleHBlY3QobW9ja0xhbWJkYUNsaWVudCkubm90LnRvSGF2ZVJlY2VpdmVkQ29tbWFuZChVcGRhdGVGdW5jdGlvbkNvZGVDb21tYW5kKTtcbiAgICAgIH1cbiAgICB9LFxuICApO1xuXG4gIHNpbGVudFRlc3QoJ2NhbGxzIHdhaXRlciBhZnRlciBmdW5jdGlvbiBjb2RlIGlzIHVwZGF0ZWQgd2l0aCBkZWxheSAxJywgYXN5bmMgKCkgPT4ge1xuICAgIC8vIEdJVkVOXG4gICAgc2V0dXAuc2V0Q3VycmVudENmblN0YWNrVGVtcGxhdGUoe1xuICAgICAgUmVzb3VyY2VzOiB7XG4gICAgICAgIEZ1bmM6IHtcbiAgICAgICAgICBUeXBlOiAnQVdTOjpMYW1iZGE6OkZ1bmN0aW9uJyxcbiAgICAgICAgICBQcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgICBDb2RlOiB7XG4gICAgICAgICAgICAgIFMzQnVja2V0OiAnY3VycmVudC1idWNrZXQnLFxuICAgICAgICAgICAgICBTM0tleTogJ2N1cnJlbnQta2V5JyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBGdW5jdGlvbk5hbWU6ICdteS1mdW5jdGlvbicsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBNZXRhZGF0YToge1xuICAgICAgICAgICAgJ2F3czphc3NldDpwYXRoJzogJ29sZC1wYXRoJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9KTtcbiAgICBjb25zdCBjZGtTdGFja0FydGlmYWN0ID0gc2V0dXAuY2RrU3RhY2tBcnRpZmFjdE9mKHtcbiAgICAgIHRlbXBsYXRlOiB7XG4gICAgICAgIFJlc291cmNlczoge1xuICAgICAgICAgIEZ1bmM6IHtcbiAgICAgICAgICAgIFR5cGU6ICdBV1M6OkxhbWJkYTo6RnVuY3Rpb24nLFxuICAgICAgICAgICAgUHJvcGVydGllczoge1xuICAgICAgICAgICAgICBDb2RlOiB7XG4gICAgICAgICAgICAgICAgUzNCdWNrZXQ6ICdjdXJyZW50LWJ1Y2tldCcsXG4gICAgICAgICAgICAgICAgUzNLZXk6ICduZXcta2V5JyxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgRnVuY3Rpb25OYW1lOiAnbXktZnVuY3Rpb24nLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIE1ldGFkYXRhOiB7XG4gICAgICAgICAgICAgICdhd3M6YXNzZXQ6cGF0aCc6ICduZXctcGF0aCcsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gV0hFTlxuICAgIGF3YWl0IGhvdHN3YXBNb2NrU2RrUHJvdmlkZXIudHJ5SG90c3dhcERlcGxveW1lbnQoaG90c3dhcE1vZGUsIGNka1N0YWNrQXJ0aWZhY3QpO1xuXG4gICAgLy8gVEhFTlxuICAgIGV4cGVjdChtb2NrTGFtYmRhQ2xpZW50KS50b0hhdmVSZWNlaXZlZENvbW1hbmQoVXBkYXRlRnVuY3Rpb25Db2RlQ29tbWFuZCk7XG4gICAgZXhwZWN0KHdhaXRVbnRpbEZ1bmN0aW9uVXBkYXRlZCkudG9IYXZlQmVlbkNhbGxlZFdpdGgoXG4gICAgICBleHBlY3Qub2JqZWN0Q29udGFpbmluZyh7XG4gICAgICAgIG1pbkRlbGF5OiAxLFxuICAgICAgICBtYXhEZWxheTogMSxcbiAgICAgICAgbWF4V2FpdFRpbWU6IDEgKiA2MCxcbiAgICAgIH0pLFxuICAgICAgeyBGdW5jdGlvbk5hbWU6ICdteS1mdW5jdGlvbicgfSxcbiAgICApO1xuICB9KTtcblxuICBzaWxlbnRUZXN0KCdjYWxscyB3YWl0ZXIgYWZ0ZXIgZnVuY3Rpb24gY29kZSBpcyB1cGRhdGVkIGFuZCBWcGNJZCBpcyBlbXB0eSBzdHJpbmcgd2l0aCBkZWxheSAxJywgYXN5bmMgKCkgPT4ge1xuICAgIC8vIEdJVkVOXG4gICAgbW9ja0xhbWJkYUNsaWVudC5vbihVcGRhdGVGdW5jdGlvbkNvZGVDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICBWcGNDb25maWc6IHtcbiAgICAgICAgVnBjSWQ6ICcnLFxuICAgICAgfSxcbiAgICB9KTtcbiAgICBzZXR1cC5zZXRDdXJyZW50Q2ZuU3RhY2tUZW1wbGF0ZSh7XG4gICAgICBSZXNvdXJjZXM6IHtcbiAgICAgICAgRnVuYzoge1xuICAgICAgICAgIFR5cGU6ICdBV1M6OkxhbWJkYTo6RnVuY3Rpb24nLFxuICAgICAgICAgIFByb3BlcnRpZXM6IHtcbiAgICAgICAgICAgIENvZGU6IHtcbiAgICAgICAgICAgICAgUzNCdWNrZXQ6ICdjdXJyZW50LWJ1Y2tldCcsXG4gICAgICAgICAgICAgIFMzS2V5OiAnY3VycmVudC1rZXknLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIEZ1bmN0aW9uTmFtZTogJ215LWZ1bmN0aW9uJyxcbiAgICAgICAgICB9LFxuICAgICAgICAgIE1ldGFkYXRhOiB7XG4gICAgICAgICAgICAnYXdzOmFzc2V0OnBhdGgnOiAnb2xkLXBhdGgnLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0pO1xuICAgIGNvbnN0IGNka1N0YWNrQXJ0aWZhY3QgPSBzZXR1cC5jZGtTdGFja0FydGlmYWN0T2Yoe1xuICAgICAgdGVtcGxhdGU6IHtcbiAgICAgICAgUmVzb3VyY2VzOiB7XG4gICAgICAgICAgRnVuYzoge1xuICAgICAgICAgICAgVHlwZTogJ0FXUzo6TGFtYmRhOjpGdW5jdGlvbicsXG4gICAgICAgICAgICBQcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgICAgIENvZGU6IHtcbiAgICAgICAgICAgICAgICBTM0J1Y2tldDogJ2N1cnJlbnQtYnVja2V0JyxcbiAgICAgICAgICAgICAgICBTM0tleTogJ25ldy1rZXknLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICBGdW5jdGlvbk5hbWU6ICdteS1mdW5jdGlvbicsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgTWV0YWRhdGE6IHtcbiAgICAgICAgICAgICAgJ2F3czphc3NldDpwYXRoJzogJ25ldy1wYXRoJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBXSEVOXG4gICAgYXdhaXQgaG90c3dhcE1vY2tTZGtQcm92aWRlci50cnlIb3Rzd2FwRGVwbG95bWVudChob3Rzd2FwTW9kZSwgY2RrU3RhY2tBcnRpZmFjdCk7XG5cbiAgICAvLyBUSEVOXG4gICAgZXhwZWN0KHdhaXRVbnRpbEZ1bmN0aW9uVXBkYXRlZCkudG9IYXZlQmVlbkNhbGxlZFdpdGgoXG4gICAgICBleHBlY3Qub2JqZWN0Q29udGFpbmluZyh7XG4gICAgICAgIG1pbkRlbGF5OiAxLFxuICAgICAgICBtYXhEZWxheTogMSxcbiAgICAgICAgbWF4V2FpdFRpbWU6IDEgKiA2MCxcbiAgICAgIH0pLFxuICAgICAgeyBGdW5jdGlvbk5hbWU6ICdteS1mdW5jdGlvbicgfSxcbiAgICApO1xuICB9KTtcblxuICBzaWxlbnRUZXN0KCdjYWxscyBnZXRGdW5jdGlvbigpIGFmdGVyIGZ1bmN0aW9uIGNvZGUgaXMgdXBkYXRlZCBvbiBhIFZQQyBmdW5jdGlvbiB3aXRoIGRlbGF5IDUnLCBhc3luYyAoKSA9PiB7XG4gICAgLy8gR0lWRU5cbiAgICBtb2NrTGFtYmRhQ2xpZW50Lm9uKFVwZGF0ZUZ1bmN0aW9uQ29kZUNvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgIFZwY0NvbmZpZzoge1xuICAgICAgICBWcGNJZDogJ2FiYycsXG4gICAgICB9LFxuICAgIH0pO1xuICAgIHNldHVwLnNldEN1cnJlbnRDZm5TdGFja1RlbXBsYXRlKHtcbiAgICAgIFJlc291cmNlczoge1xuICAgICAgICBGdW5jOiB7XG4gICAgICAgICAgVHlwZTogJ0FXUzo6TGFtYmRhOjpGdW5jdGlvbicsXG4gICAgICAgICAgUHJvcGVydGllczoge1xuICAgICAgICAgICAgQ29kZToge1xuICAgICAgICAgICAgICBTM0J1Y2tldDogJ2N1cnJlbnQtYnVja2V0JyxcbiAgICAgICAgICAgICAgUzNLZXk6ICdjdXJyZW50LWtleScsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgRnVuY3Rpb25OYW1lOiAnbXktZnVuY3Rpb24nLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgTWV0YWRhdGE6IHtcbiAgICAgICAgICAgICdhd3M6YXNzZXQ6cGF0aCc6ICdvbGQtcGF0aCcsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgY29uc3QgY2RrU3RhY2tBcnRpZmFjdCA9IHNldHVwLmNka1N0YWNrQXJ0aWZhY3RPZih7XG4gICAgICB0ZW1wbGF0ZToge1xuICAgICAgICBSZXNvdXJjZXM6IHtcbiAgICAgICAgICBGdW5jOiB7XG4gICAgICAgICAgICBUeXBlOiAnQVdTOjpMYW1iZGE6OkZ1bmN0aW9uJyxcbiAgICAgICAgICAgIFByb3BlcnRpZXM6IHtcbiAgICAgICAgICAgICAgQ29kZToge1xuICAgICAgICAgICAgICAgIFMzQnVja2V0OiAnY3VycmVudC1idWNrZXQnLFxuICAgICAgICAgICAgICAgIFMzS2V5OiAnbmV3LWtleScsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIEZ1bmN0aW9uTmFtZTogJ215LWZ1bmN0aW9uJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBNZXRhZGF0YToge1xuICAgICAgICAgICAgICAnYXdzOmFzc2V0OnBhdGgnOiAnbmV3LXBhdGgnLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIFdIRU5cbiAgICBhd2FpdCBob3Rzd2FwTW9ja1Nka1Byb3ZpZGVyLnRyeUhvdHN3YXBEZXBsb3ltZW50KGhvdHN3YXBNb2RlLCBjZGtTdGFja0FydGlmYWN0KTtcblxuICAgIC8vIFRIRU5cbiAgICBleHBlY3Qod2FpdFVudGlsRnVuY3Rpb25VcGRhdGVkKS50b0hhdmVCZWVuQ2FsbGVkV2l0aChcbiAgICAgIGV4cGVjdC5vYmplY3RDb250YWluaW5nKHtcbiAgICAgICAgbWluRGVsYXk6IDUsXG4gICAgICAgIG1heERlbGF5OiA1LFxuICAgICAgICBtYXhXYWl0VGltZTogNSAqIDYwLFxuICAgICAgfSksXG4gICAgICB7IEZ1bmN0aW9uTmFtZTogJ215LWZ1bmN0aW9uJyB9LFxuICAgICk7XG4gIH0pO1xuXG4gIHNpbGVudFRlc3QoXG4gICAgJ2NhbGxzIHRoZSB1cGRhdGVMYW1iZGFDb25maWd1cmF0aW9uKCkgQVBJIHdoZW4gaXQgcmVjZWl2ZXMgZGlmZmVyZW5jZSBpbiBEZXNjcmlwdGlvbiBmaWVsZCBvZiBhIExhbWJkYSBmdW5jdGlvbicsXG4gICAgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gR0lWRU5cbiAgICAgIHNldHVwLnNldEN1cnJlbnRDZm5TdGFja1RlbXBsYXRlKHtcbiAgICAgICAgUmVzb3VyY2VzOiB7XG4gICAgICAgICAgRnVuYzoge1xuICAgICAgICAgICAgVHlwZTogJ0FXUzo6TGFtYmRhOjpGdW5jdGlvbicsXG4gICAgICAgICAgICBQcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgICAgIENvZGU6IHtcbiAgICAgICAgICAgICAgICBTM0J1Y2tldDogJ3MzLWJ1Y2tldCcsXG4gICAgICAgICAgICAgICAgUzNLZXk6ICdzMy1rZXknLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICBGdW5jdGlvbk5hbWU6ICdteS1mdW5jdGlvbicsXG4gICAgICAgICAgICAgIERlc2NyaXB0aW9uOiAnT2xkIERlc2NyaXB0aW9uJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBNZXRhZGF0YToge1xuICAgICAgICAgICAgICAnYXdzOmFzc2V0OnBhdGgnOiAnYXNzZXQtcGF0aCcsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICAgIGNvbnN0IGNka1N0YWNrQXJ0aWZhY3QgPSBzZXR1cC5jZGtTdGFja0FydGlmYWN0T2Yoe1xuICAgICAgICB0ZW1wbGF0ZToge1xuICAgICAgICAgIFJlc291cmNlczoge1xuICAgICAgICAgICAgRnVuYzoge1xuICAgICAgICAgICAgICBUeXBlOiAnQVdTOjpMYW1iZGE6OkZ1bmN0aW9uJyxcbiAgICAgICAgICAgICAgUHJvcGVydGllczoge1xuICAgICAgICAgICAgICAgIENvZGU6IHtcbiAgICAgICAgICAgICAgICAgIFMzQnVja2V0OiAnczMtYnVja2V0JyxcbiAgICAgICAgICAgICAgICAgIFMzS2V5OiAnczMta2V5JyxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIEZ1bmN0aW9uTmFtZTogJ215LWZ1bmN0aW9uJyxcbiAgICAgICAgICAgICAgICBEZXNjcmlwdGlvbjogJ05ldyBEZXNjcmlwdGlvbicsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIE1ldGFkYXRhOiB7XG4gICAgICAgICAgICAgICAgJ2F3czphc3NldDpwYXRoJzogJ2Fzc2V0LXBhdGgnLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSk7XG5cbiAgICAgIC8vIFdIRU5cbiAgICAgIGNvbnN0IGRlcGxveVN0YWNrUmVzdWx0ID0gYXdhaXQgaG90c3dhcE1vY2tTZGtQcm92aWRlci50cnlIb3Rzd2FwRGVwbG95bWVudChob3Rzd2FwTW9kZSwgY2RrU3RhY2tBcnRpZmFjdCk7XG5cbiAgICAgIC8vIFRIRU5cbiAgICAgIGV4cGVjdChkZXBsb3lTdGFja1Jlc3VsdCkubm90LnRvQmVVbmRlZmluZWQoKTtcbiAgICAgIGV4cGVjdChtb2NrTGFtYmRhQ2xpZW50KS50b0hhdmVSZWNlaXZlZENvbW1hbmRXaXRoKFVwZGF0ZUZ1bmN0aW9uQ29uZmlndXJhdGlvbkNvbW1hbmQsIHtcbiAgICAgICAgRnVuY3Rpb25OYW1lOiAnbXktZnVuY3Rpb24nLFxuICAgICAgICBEZXNjcmlwdGlvbjogJ05ldyBEZXNjcmlwdGlvbicsXG4gICAgICB9KTtcbiAgICB9LFxuICApO1xuXG4gIHNpbGVudFRlc3QoXG4gICAgJ2NhbGxzIHRoZSB1cGRhdGVMYW1iZGFDb25maWd1cmF0aW9uKCkgQVBJIHdoZW4gaXQgcmVjZWl2ZXMgZGlmZmVyZW5jZSBpbiBFbnZpcm9ubWVudCBmaWVsZCBvZiBhIExhbWJkYSBmdW5jdGlvbicsXG4gICAgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gR0lWRU5cbiAgICAgIHNldHVwLnNldEN1cnJlbnRDZm5TdGFja1RlbXBsYXRlKHtcbiAgICAgICAgUmVzb3VyY2VzOiB7XG4gICAgICAgICAgRnVuYzoge1xuICAgICAgICAgICAgVHlwZTogJ0FXUzo6TGFtYmRhOjpGdW5jdGlvbicsXG4gICAgICAgICAgICBQcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgICAgIENvZGU6IHtcbiAgICAgICAgICAgICAgICBTM0J1Y2tldDogJ3MzLWJ1Y2tldCcsXG4gICAgICAgICAgICAgICAgUzNLZXk6ICdzMy1rZXknLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICBGdW5jdGlvbk5hbWU6ICdteS1mdW5jdGlvbicsXG4gICAgICAgICAgICAgIEVudmlyb25tZW50OiB7XG4gICAgICAgICAgICAgICAgVmFyaWFibGVzOiB7XG4gICAgICAgICAgICAgICAgICBLZXkxOiAnVmFsdWUxJyxcbiAgICAgICAgICAgICAgICAgIEtleTI6ICdWYWx1ZTInLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgTWV0YWRhdGE6IHtcbiAgICAgICAgICAgICAgJ2F3czphc3NldDpwYXRoJzogJ2Fzc2V0LXBhdGgnLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgICBjb25zdCBjZGtTdGFja0FydGlmYWN0ID0gc2V0dXAuY2RrU3RhY2tBcnRpZmFjdE9mKHtcbiAgICAgICAgdGVtcGxhdGU6IHtcbiAgICAgICAgICBSZXNvdXJjZXM6IHtcbiAgICAgICAgICAgIEZ1bmM6IHtcbiAgICAgICAgICAgICAgVHlwZTogJ0FXUzo6TGFtYmRhOjpGdW5jdGlvbicsXG4gICAgICAgICAgICAgIFByb3BlcnRpZXM6IHtcbiAgICAgICAgICAgICAgICBDb2RlOiB7XG4gICAgICAgICAgICAgICAgICBTM0J1Y2tldDogJ3MzLWJ1Y2tldCcsXG4gICAgICAgICAgICAgICAgICBTM0tleTogJ3MzLWtleScsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBGdW5jdGlvbk5hbWU6ICdteS1mdW5jdGlvbicsXG4gICAgICAgICAgICAgICAgRW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICAgICAgICAgIFZhcmlhYmxlczoge1xuICAgICAgICAgICAgICAgICAgICBLZXkxOiAnVmFsdWUxJyxcbiAgICAgICAgICAgICAgICAgICAgS2V5MjogJ1ZhbHVlMicsXG4gICAgICAgICAgICAgICAgICAgIE5ld0tleTogJ05ld1ZhbHVlJyxcbiAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgTWV0YWRhdGE6IHtcbiAgICAgICAgICAgICAgICAnYXdzOmFzc2V0OnBhdGgnOiAnYXNzZXQtcGF0aCcsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgLy8gV0hFTlxuICAgICAgY29uc3QgZGVwbG95U3RhY2tSZXN1bHQgPSBhd2FpdCBob3Rzd2FwTW9ja1Nka1Byb3ZpZGVyLnRyeUhvdHN3YXBEZXBsb3ltZW50KGhvdHN3YXBNb2RlLCBjZGtTdGFja0FydGlmYWN0KTtcblxuICAgICAgLy8gVEhFTlxuICAgICAgZXhwZWN0KGRlcGxveVN0YWNrUmVzdWx0KS5ub3QudG9CZVVuZGVmaW5lZCgpO1xuICAgICAgZXhwZWN0KG1vY2tMYW1iZGFDbGllbnQpLnRvSGF2ZVJlY2VpdmVkQ29tbWFuZFdpdGgoVXBkYXRlRnVuY3Rpb25Db25maWd1cmF0aW9uQ29tbWFuZCwge1xuICAgICAgICBGdW5jdGlvbk5hbWU6ICdteS1mdW5jdGlvbicsXG4gICAgICAgIEVudmlyb25tZW50OiB7XG4gICAgICAgICAgVmFyaWFibGVzOiB7XG4gICAgICAgICAgICBLZXkxOiAnVmFsdWUxJyxcbiAgICAgICAgICAgIEtleTI6ICdWYWx1ZTInLFxuICAgICAgICAgICAgTmV3S2V5OiAnTmV3VmFsdWUnLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9LFxuICApO1xuXG4gIHNpbGVudFRlc3QoXG4gICAgJ2NhbGxzIGJvdGggdXBkYXRlTGFtYmRhQ29kZSgpIGFuZCB1cGRhdGVMYW1iZGFDb25maWd1cmF0aW9uKCkgQVBJIHdoZW4gaXQgcmVjZWl2ZXMgYm90aCBjb2RlIGFuZCBjb25maWd1cmF0aW9uIGNoYW5nZScsXG4gICAgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gR0lWRU5cbiAgICAgIHNldHVwLnNldEN1cnJlbnRDZm5TdGFja1RlbXBsYXRlKHtcbiAgICAgICAgUmVzb3VyY2VzOiB7XG4gICAgICAgICAgRnVuYzoge1xuICAgICAgICAgICAgVHlwZTogJ0FXUzo6TGFtYmRhOjpGdW5jdGlvbicsXG4gICAgICAgICAgICBQcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgICAgIENvZGU6IHtcbiAgICAgICAgICAgICAgICBTM0J1Y2tldDogJ2N1cnJlbnQtYnVja2V0JyxcbiAgICAgICAgICAgICAgICBTM0tleTogJ2N1cnJlbnQta2V5JyxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgRnVuY3Rpb25OYW1lOiAnbXktZnVuY3Rpb24nLFxuICAgICAgICAgICAgICBEZXNjcmlwdGlvbjogJ09sZCBEZXNjcmlwdGlvbicsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgTWV0YWRhdGE6IHtcbiAgICAgICAgICAgICAgJ2F3czphc3NldDpwYXRoJzogJ2Fzc2V0LXBhdGgnLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgICBjb25zdCBjZGtTdGFja0FydGlmYWN0ID0gc2V0dXAuY2RrU3RhY2tBcnRpZmFjdE9mKHtcbiAgICAgICAgdGVtcGxhdGU6IHtcbiAgICAgICAgICBSZXNvdXJjZXM6IHtcbiAgICAgICAgICAgIEZ1bmM6IHtcbiAgICAgICAgICAgICAgVHlwZTogJ0FXUzo6TGFtYmRhOjpGdW5jdGlvbicsXG4gICAgICAgICAgICAgIFByb3BlcnRpZXM6IHtcbiAgICAgICAgICAgICAgICBDb2RlOiB7XG4gICAgICAgICAgICAgICAgICBTM0J1Y2tldDogJ25ldy1idWNrZXQnLFxuICAgICAgICAgICAgICAgICAgUzNLZXk6ICduZXcta2V5JyxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIEZ1bmN0aW9uTmFtZTogJ215LWZ1bmN0aW9uJyxcbiAgICAgICAgICAgICAgICBEZXNjcmlwdGlvbjogJ05ldyBEZXNjcmlwdGlvbicsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIE1ldGFkYXRhOiB7XG4gICAgICAgICAgICAgICAgJ2F3czphc3NldDpwYXRoJzogJ2Fzc2V0LXBhdGgnLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSk7XG5cbiAgICAgIC8vIFdIRU5cbiAgICAgIGNvbnN0IGRlcGxveVN0YWNrUmVzdWx0ID0gYXdhaXQgaG90c3dhcE1vY2tTZGtQcm92aWRlci50cnlIb3Rzd2FwRGVwbG95bWVudChob3Rzd2FwTW9kZSwgY2RrU3RhY2tBcnRpZmFjdCk7XG5cbiAgICAgIC8vIFRIRU5cbiAgICAgIGV4cGVjdChkZXBsb3lTdGFja1Jlc3VsdCkubm90LnRvQmVVbmRlZmluZWQoKTtcbiAgICAgIGV4cGVjdChtb2NrTGFtYmRhQ2xpZW50KS50b0hhdmVSZWNlaXZlZENvbW1hbmRXaXRoKFVwZGF0ZUZ1bmN0aW9uQ29uZmlndXJhdGlvbkNvbW1hbmQsIHtcbiAgICAgICAgRnVuY3Rpb25OYW1lOiAnbXktZnVuY3Rpb24nLFxuICAgICAgICBEZXNjcmlwdGlvbjogJ05ldyBEZXNjcmlwdGlvbicsXG4gICAgICB9KTtcbiAgICAgIGV4cGVjdChtb2NrTGFtYmRhQ2xpZW50KS50b0hhdmVSZWNlaXZlZENvbW1hbmRXaXRoKFVwZGF0ZUZ1bmN0aW9uQ29kZUNvbW1hbmQsIHtcbiAgICAgICAgRnVuY3Rpb25OYW1lOiAnbXktZnVuY3Rpb24nLFxuICAgICAgICBTM0J1Y2tldDogJ25ldy1idWNrZXQnLFxuICAgICAgICBTM0tleTogJ25ldy1rZXknLFxuICAgICAgfSk7XG4gICAgfSxcbiAgKTtcblxuICBzaWxlbnRUZXN0KFxuICAgICdMYW1iZGEgaG90c3dhcCB3b3JrcyBwcm9wZXJseSB3aXRoIGNoYW5nZXMgb2YgZW52aXJvbm1lbnQgdmFyaWFibGVzIGFuZCBkZXNjcmlwdGlvbiB3aXRoIHRva2VucycsXG4gICAgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gR0lWRU5cbiAgICAgIHNldHVwLnNldEN1cnJlbnRDZm5TdGFja1RlbXBsYXRlKHtcbiAgICAgICAgUmVzb3VyY2VzOiB7XG4gICAgICAgICAgRXZlbnRCdXM6IHtcbiAgICAgICAgICAgIFR5cGU6ICdBV1M6OkV2ZW50czo6RXZlbnRCdXMnLFxuICAgICAgICAgICAgUHJvcGVydGllczoge1xuICAgICAgICAgICAgICBOYW1lOiAnbXktZXZlbnQtYnVzJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICBGdW5jOiB7XG4gICAgICAgICAgICBUeXBlOiAnQVdTOjpMYW1iZGE6OkZ1bmN0aW9uJyxcbiAgICAgICAgICAgIFByb3BlcnRpZXM6IHtcbiAgICAgICAgICAgICAgQ29kZToge1xuICAgICAgICAgICAgICAgIFMzQnVja2V0OiAnczMtYnVja2V0JyxcbiAgICAgICAgICAgICAgICBTM0tleTogJ3MzLWtleScsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIEZ1bmN0aW9uTmFtZTogJ215LWZ1bmN0aW9uJyxcbiAgICAgICAgICAgICAgRW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICAgICAgICBWYXJpYWJsZXM6IHtcbiAgICAgICAgICAgICAgICAgIHRva2VuOiB7ICdGbjo6R2V0QXR0JzogWydFdmVudEJ1cycsICdBcm4nXSB9LFxuICAgICAgICAgICAgICAgICAgbGl0ZXJhbDogJ29sZFZhbHVlJyxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICBEZXNjcmlwdGlvbjoge1xuICAgICAgICAgICAgICAgICdGbjo6Sm9pbic6IFsnJywgWydvbGRWYWx1ZScsIHsgJ0ZuOjpHZXRBdHQnOiBbJ0V2ZW50QnVzJywgJ0FybiddIH1dXSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBNZXRhZGF0YToge1xuICAgICAgICAgICAgICAnYXdzOmFzc2V0OnBhdGgnOiAnYXNzZXQtcGF0aCcsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgc2V0dXAucHVzaFN0YWNrUmVzb3VyY2VTdW1tYXJpZXMoc2V0dXAuc3RhY2tTdW1tYXJ5T2YoJ0V2ZW50QnVzJywgJ0FXUzo6RXZlbnRzOjpFdmVudEJ1cycsICdteS1ldmVudC1idXMnKSk7XG5cbiAgICAgIGNvbnN0IGNka1N0YWNrQXJ0aWZhY3QgPSBzZXR1cC5jZGtTdGFja0FydGlmYWN0T2Yoe1xuICAgICAgICB0ZW1wbGF0ZToge1xuICAgICAgICAgIFJlc291cmNlczoge1xuICAgICAgICAgICAgRXZlbnRCdXM6IHtcbiAgICAgICAgICAgICAgVHlwZTogJ0FXUzo6RXZlbnRzOjpFdmVudEJ1cycsXG4gICAgICAgICAgICAgIFByb3BlcnRpZXM6IHtcbiAgICAgICAgICAgICAgICBOYW1lOiAnbXktZXZlbnQtYnVzJyxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBGdW5jOiB7XG4gICAgICAgICAgICAgIFR5cGU6ICdBV1M6OkxhbWJkYTo6RnVuY3Rpb24nLFxuICAgICAgICAgICAgICBQcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgICAgICAgQ29kZToge1xuICAgICAgICAgICAgICAgICAgUzNCdWNrZXQ6ICdzMy1idWNrZXQnLFxuICAgICAgICAgICAgICAgICAgUzNLZXk6ICdzMy1rZXknLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgRnVuY3Rpb25OYW1lOiAnbXktZnVuY3Rpb24nLFxuICAgICAgICAgICAgICAgIEVudmlyb25tZW50OiB7XG4gICAgICAgICAgICAgICAgICBWYXJpYWJsZXM6IHtcbiAgICAgICAgICAgICAgICAgICAgdG9rZW46IHsgJ0ZuOjpHZXRBdHQnOiBbJ0V2ZW50QnVzJywgJ0FybiddIH0sXG4gICAgICAgICAgICAgICAgICAgIGxpdGVyYWw6ICduZXdWYWx1ZScsXG4gICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgRGVzY3JpcHRpb246IHtcbiAgICAgICAgICAgICAgICAgICdGbjo6Sm9pbic6IFsnJywgWyduZXdWYWx1ZScsIHsgJ0ZuOjpHZXRBdHQnOiBbJ0V2ZW50QnVzJywgJ0FybiddIH1dXSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICBNZXRhZGF0YToge1xuICAgICAgICAgICAgICAgICdhd3M6YXNzZXQ6cGF0aCc6ICdhc3NldC1wYXRoJyxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBXSEVOXG4gICAgICBjb25zdCBkZXBsb3lTdGFja1Jlc3VsdCA9IGF3YWl0IGhvdHN3YXBNb2NrU2RrUHJvdmlkZXIudHJ5SG90c3dhcERlcGxveW1lbnQoaG90c3dhcE1vZGUsIGNka1N0YWNrQXJ0aWZhY3QpO1xuXG4gICAgICAvLyBUSEVOXG4gICAgICBleHBlY3QoZGVwbG95U3RhY2tSZXN1bHQpLm5vdC50b0JlVW5kZWZpbmVkKCk7XG4gICAgICBleHBlY3QobW9ja0xhbWJkYUNsaWVudCkudG9IYXZlUmVjZWl2ZWRDb21tYW5kV2l0aChVcGRhdGVGdW5jdGlvbkNvbmZpZ3VyYXRpb25Db21tYW5kLCB7XG4gICAgICAgIEZ1bmN0aW9uTmFtZTogJ215LWZ1bmN0aW9uJyxcbiAgICAgICAgRW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBWYXJpYWJsZXM6IHtcbiAgICAgICAgICAgIHRva2VuOiAnYXJuOnN3YTpldmVudHM6aGVyZToxMjM0NTY3ODkwMTI6ZXZlbnQtYnVzL215LWV2ZW50LWJ1cycsXG4gICAgICAgICAgICBsaXRlcmFsOiAnbmV3VmFsdWUnLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIERlc2NyaXB0aW9uOiAnbmV3VmFsdWVhcm46c3dhOmV2ZW50czpoZXJlOjEyMzQ1Njc4OTAxMjpldmVudC1idXMvbXktZXZlbnQtYnVzJyxcbiAgICAgIH0pO1xuICAgIH0sXG4gICk7XG5cbiAgc2lsZW50VGVzdCgnUzNPYmplY3RWZXJzaW9uIGlzIGhvdHN3YXBwYWJsZScsIGFzeW5jICgpID0+IHtcbiAgICAvLyBHSVZFTlxuICAgIHNldHVwLnNldEN1cnJlbnRDZm5TdGFja1RlbXBsYXRlKHtcbiAgICAgIFJlc291cmNlczoge1xuICAgICAgICBGdW5jOiB7XG4gICAgICAgICAgVHlwZTogJ0FXUzo6TGFtYmRhOjpGdW5jdGlvbicsXG4gICAgICAgICAgUHJvcGVydGllczoge1xuICAgICAgICAgICAgQ29kZToge1xuICAgICAgICAgICAgICBTM0tleTogJ2N1cnJlbnQta2V5JyxcbiAgICAgICAgICAgICAgUzNPYmplY3RWZXJzaW9uOiAnY3VycmVudC1vYmonLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIEZ1bmN0aW9uTmFtZTogJ215LWZ1bmN0aW9uJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9KTtcbiAgICBjb25zdCBjZGtTdGFja0FydGlmYWN0ID0gc2V0dXAuY2RrU3RhY2tBcnRpZmFjdE9mKHtcbiAgICAgIHRlbXBsYXRlOiB7XG4gICAgICAgIFJlc291cmNlczoge1xuICAgICAgICAgIEZ1bmM6IHtcbiAgICAgICAgICAgIFR5cGU6ICdBV1M6OkxhbWJkYTo6RnVuY3Rpb24nLFxuICAgICAgICAgICAgUHJvcGVydGllczoge1xuICAgICAgICAgICAgICBDb2RlOiB7XG4gICAgICAgICAgICAgICAgUzNLZXk6ICduZXcta2V5JyxcbiAgICAgICAgICAgICAgICBTM09iamVjdFZlcnNpb246ICduZXctb2JqJyxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgRnVuY3Rpb25OYW1lOiAnbXktZnVuY3Rpb24nLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIFdIRU5cbiAgICBjb25zdCBkZXBsb3lTdGFja1Jlc3VsdCA9IGF3YWl0IGhvdHN3YXBNb2NrU2RrUHJvdmlkZXIudHJ5SG90c3dhcERlcGxveW1lbnQoaG90c3dhcE1vZGUsIGNka1N0YWNrQXJ0aWZhY3QpO1xuXG4gICAgLy8gVEhFTlxuICAgIGV4cGVjdChkZXBsb3lTdGFja1Jlc3VsdCkubm90LnRvQmVVbmRlZmluZWQoKTtcbiAgICBleHBlY3QobW9ja0xhbWJkYUNsaWVudCkudG9IYXZlUmVjZWl2ZWRDb21tYW5kV2l0aChVcGRhdGVGdW5jdGlvbkNvZGVDb21tYW5kLCB7XG4gICAgICBGdW5jdGlvbk5hbWU6ICdteS1mdW5jdGlvbicsXG4gICAgICBTM0tleTogJ25ldy1rZXknLFxuICAgICAgUzNPYmplY3RWZXJzaW9uOiAnbmV3LW9iaicsXG4gICAgfSk7XG4gIH0pO1xufSk7XG4iXX0=