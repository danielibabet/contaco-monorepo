import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as path from 'path';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';

export class InfrastructureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    cdk.Tags.of(this).add('Project', 'ContaCo');
    cdk.Tags.of(this).add('Environment', 'Demo');
    cdk.Tags.of(this).add('ManagedBy', 'CDK');

    new budgets.CfnBudget(this, 'ContaCoBudget', {
      budget: {
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: { amount: 5, unit: 'USD' },
      },
      notificationsWithSubscribers: [
        { notification: { notificationType: 'ACTUAL', comparisonOperator: 'GREATER_THAN', threshold: 100 }, subscribers: [{ subscriptionType: 'EMAIL', address: 'danielibabet@gmail.com' }] },
      ],
    });

    const cognitoCustomMessageLambda = new lambda.Function(this, 'CognitoCustomMessageLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'cognitoCustomMessage.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
    });

    const userPool = new cognito.UserPool(this, 'ContaCoUserPool', {
      userPoolName: 'contaco-users',
      passwordPolicy: { requireSymbols: false, requireUppercase: true, requireLowercase: true, requireDigits: true, minLength: 8 },
      selfSignUpEnabled: true, 
      signInAliases: { email: true },
      autoVerify: { email: true },
      lambdaTriggers: {
        customMessage: cognitoCustomMessageLambda,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY, 
    });

    const userPoolDomain = userPool.addDomain('ContaCoDomain', {
      cognitoDomain: { domainPrefix: `contaco-auth-${this.account}` },
    });

    const userPoolClient = userPool.addClient('ContaCoNextAuthClient', {
      userPoolClientName: 'contaco-nextauth',
      generateSecret: true,
      authFlows: { userPassword: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.EMAIL, cognito.OAuthScope.OPENID, cognito.OAuthScope.PROFILE],
        callbackUrls: ['http://localhost:3000/api/auth/callback/cognito'],
        logoutUrls: ['http://localhost:3000'],
      },
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
      accessTokenValidity: cdk.Duration.days(1),
      idTokenValidity: cdk.Duration.days(1),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    const table = new dynamodb.Table(this, 'ContaCoTable', {
      tableName: 'ContaCoTable',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery: true,
    });

    table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const docsBucket = new s3.Bucket(this, 'ContaCoDocsBucket', {
      bucketName: `contaco-docs-${this.account}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
        },
      ],
      lifecycleRules: [
        {
          id: 'DeleteExportsAfter2Days',
          prefix: 'exports/',
          expiration: cdk.Duration.days(2),
        }
      ]
    });

    // 1. SQS Queues
    const dlq = new sqs.Queue(this, 'ImportadorDLQ');
    const batchWriteQueue = new sqs.Queue(this, 'BatchWriteQueue', {
      visibilityTimeout: cdk.Duration.seconds(30),
      deadLetterQueue: { queue: dlq, maxReceiveCount: 3 }
    });

    // 3. Lambdas
    const crearAsientoLambda = new lambda.Function(this, 'CrearAsientoLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'crearAsiento.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: { TABLE_NAME: table.tableName },
    });

    const listarSubcuentasLambda = new lambda.Function(this, 'ListarSubcuentasLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'listarSubcuentas.handler',
      timeout: cdk.Duration.seconds(30),
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: { TABLE_NAME: table.tableName },
    });

    const obtenerMayorLambda = new lambda.Function(this, 'ObtenerMayorLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'obtenerMayor.handler',
      timeout: cdk.Duration.seconds(30),
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: { TABLE_NAME: table.tableName },
    });

    const obtenerBalanceLambda = new lambda.Function(this, 'ObtenerBalanceLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'obtenerBalanceSumasSaldos.handler',
      timeout: cdk.Duration.seconds(30),
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: { TABLE_NAME: table.tableName },
    });

    const cerrarEjercicioLambda = new lambda.Function(this, 'CerrarEjercicioLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'cerrarEjercicio.handler',
      timeout: cdk.Duration.seconds(30),
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: { TABLE_NAME: table.tableName },
    });

    const gestionarEmpresasLambda = new lambda.Function(this, 'GestionarEmpresasLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'gestionarEmpresas.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: { TABLE_NAME: table.tableName },
    });

    const obtenerDiarioLambda = new lambda.Function(this, 'ObtenerDiarioLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'obtenerDiario.handler',
      timeout: cdk.Duration.seconds(30),
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: { TABLE_NAME: table.tableName },
    });

    const exportarDiarioLambda = new lambda.Function(this, 'ExportarDiarioLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'exportarDiario.handler',
      timeout: cdk.Duration.seconds(60),
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: { TABLE_NAME: table.tableName, BUCKET_NAME: docsBucket.bucketName },
    });

    const borrarAsientoLambda = new lambda.Function(this, 'BorrarAsientoLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'borrarAsiento.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: { TABLE_NAME: table.tableName },
    });

    const editarAsientoLambda = new lambda.Function(this, 'EditarAsientoLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'editarAsiento.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: { TABLE_NAME: table.tableName },
    });

    const calcularModelo303Lambda = new lambda.Function(this, 'CalcularModelo303Lambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'calcularModelo303.handler',
      timeout: cdk.Duration.seconds(30),
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: { TABLE_NAME: table.tableName },
    });

    const calcularModelo390Lambda = new lambda.Function(this, 'CalcularModelo390Lambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'calcularModelo390.handler',
      timeout: cdk.Duration.seconds(30),
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: { TABLE_NAME: table.tableName },
    });

    const calcularModelo347Lambda = new lambda.Function(this, 'CalcularModelo347Lambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'calcularModelo347.handler',
      timeout: cdk.Duration.seconds(30),
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: { TABLE_NAME: table.tableName },
    });

    const gestionarPlantillasLambda = new lambda.Function(this, 'GestionarPlantillasLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'gestionarPlantillas.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: { TABLE_NAME: table.tableName },
    });

    const alternarPunteoLambda = new lambda.Function(this, 'AlternarPunteoLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'alternarPunteo.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: { TABLE_NAME: table.tableName },
    });

    const generarUrlSubidaLambda = new lambda.Function(this, 'GenerarUrlSubidaLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'generarUrlSubida.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: { TABLE_NAME: table.tableName, BUCKET_NAME: docsBucket.bucketName },
    });

    const obtenerUrlDescargaLambda = new lambda.Function(this, 'ObtenerUrlDescargaLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'obtenerUrlDescarga.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: { BUCKET_NAME: docsBucket.bucketName },
    });

    const obtenerAsientoLambda = new lambda.Function(this, 'ObtenerAsientoLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'obtenerAsiento.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: { TABLE_NAME: table.tableName },
    });

    const gestionarFacturasLambda = new lambda.Function(this, 'GestionarFacturasLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'gestionarFacturas.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: { TABLE_NAME: table.tableName },
    });

    const gestionarTesoreriaLambda = new lambda.Function(this, 'GestionarTesoreriaLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'gestionarTesoreria.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: { TABLE_NAME: table.tableName },
    });

    const procesarFicheroBancoLambda = new lambda.Function(this, 'ProcesarFicheroBancoLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'procesarFicheroBanco.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: { TABLE_NAME: table.tableName } // Necesita DDB para AutoMatch
    });

    const gestionarActivosLambda = new lambda.Function(this, 'GestionarActivosLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'gestionarActivos.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: { TABLE_NAME: table.tableName }
    });

    const gestionarDashboardLambda = new lambda.Function(this, 'GestionarDashboardLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'gestionarDashboard.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: { TABLE_NAME: table.tableName }
    });

    const cronAmortizacionesLambda = new lambda.Function(this, 'CronAmortizacionesLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'cronAmortizaciones.handler',
      timeout: cdk.Duration.minutes(5),
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: { TABLE_NAME: table.tableName }
    });

    // CRON: El primer día de cada mes a las 00:00 UTC (Mes vencido o inicio de mes)
    // Para probarlo en vivo fácilmente, usa este cron (cada 5 min): cron(0/5 * * * ? *)
    const cronRule = new events.Rule(this, 'CronAmortizacionesRule', {
      schedule: events.Schedule.expression('cron(0 0 1 * ? *)'),
    });
    cronRule.addTarget(new targets.LambdaFunction(cronAmortizacionesLambda));

    // ÉPICA 1: Lambdas para Importador
    const extractoraLambda = new lambda.Function(this, 'ExtractoraZipLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'extractora.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      timeout: cdk.Duration.minutes(15),
      memorySize: 2048,
      environment: { SQS_QUEUE_URL: batchWriteQueue.queueUrl }
    });
    docsBucket.grantRead(extractoraLambda);
    batchWriteQueue.grantSendMessages(extractoraLambda);
    docsBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(extractoraLambda), { prefix: 'migraciones/' });

    const dbfWriterLambda = new lambda.Function(this, 'DBFWriterLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'writer.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      timeout: cdk.Duration.seconds(30),
      environment: { TABLE_NAME: table.tableName }
    });
    table.grantWriteData(dbfWriterLambda);
    dbfWriterLambda.addEventSource(new lambdaEventSources.SqsEventSource(batchWriteQueue, { batchSize: 10 }));

    // ÉPICA 2: Lambda OCR Docker
    const ocrLambda = new lambda.DockerImageFunction(this, 'OcrFacturasLambda', {
      code: lambda.DockerImageCode.fromImageAsset(path.join(__dirname, '../../backend'), {
        file: 'ocr.Dockerfile',
      }),
      environment: {
        BUCKET_NAME: docsBucket.bucketName,
      },
      timeout: cdk.Duration.minutes(2),
      memorySize: 1024,
    });
    docsBucket.grantRead(ocrLambda);

    // Permisos Restantes
    table.grantWriteData(crearAsientoLambda);
    table.grantReadData(listarSubcuentasLambda);
    table.grantReadData(obtenerMayorLambda);
    table.grantReadData(obtenerBalanceLambda);
    table.grantReadWriteData(cerrarEjercicioLambda);
    table.grantReadWriteData(gestionarEmpresasLambda);
    table.grantReadData(obtenerDiarioLambda);
    table.grantReadData(exportarDiarioLambda);
    table.grantReadData(obtenerAsientoLambda);
    table.grantReadWriteData(borrarAsientoLambda);
    table.grantReadWriteData(editarAsientoLambda);
    table.grantReadData(calcularModelo303Lambda);
    table.grantReadData(calcularModelo390Lambda);
    table.grantReadData(calcularModelo347Lambda);
    table.grantReadWriteData(gestionarPlantillasLambda);
    table.grantReadWriteData(alternarPunteoLambda);
    table.grantReadWriteData(generarUrlSubidaLambda);
    table.grantReadData(procesarFicheroBancoLambda);
    table.grantReadWriteData(gestionarFacturasLambda);
    table.grantReadWriteData(gestionarTesoreriaLambda);
    table.grantReadWriteData(gestionarActivosLambda);
    table.grantReadData(gestionarDashboardLambda);
    table.grantReadWriteData(cronAmortizacionesLambda);

    docsBucket.grantPut(generarUrlSubidaLambda);
    docsBucket.grantRead(obtenerUrlDescargaLambda);
    docsBucket.grantPut(exportarDiarioLambda);
    docsBucket.grantRead(exportarDiarioLambda);

    // 4. API GraphQL: AWS AppSync
    const api = new appsync.GraphqlApi(this, 'ContaCoApi', {
      name: 'contaco-api',
      schema: appsync.SchemaFile.fromAsset(path.join(__dirname, '../graphql/schema.graphql')),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.USER_POOL,
          userPoolConfig: { userPool: userPool },
        },
      },
    });

    const lambdaDataSource = api.addLambdaDataSource('LambdaDS', crearAsientoLambda);
    const subcuentasDataSource = api.addLambdaDataSource('SubcuentasDS', listarSubcuentasLambda);
    const mayorDataSource = api.addLambdaDataSource('MayorDS', obtenerMayorLambda);
    const balanceDataSource = api.addLambdaDataSource('BalanceDS', obtenerBalanceLambda);
    const cierreDataSource = api.addLambdaDataSource('CierreDS', cerrarEjercicioLambda);
    const empresasDataSource = api.addLambdaDataSource('EmpresasDS', gestionarEmpresasLambda);
    const diarioDataSource = api.addLambdaDataSource('DiarioDS', obtenerDiarioLambda);
    const exportarDiarioDataSource = api.addLambdaDataSource('ExportarDiarioDS', exportarDiarioLambda);
    const borrarDataSource = api.addLambdaDataSource('BorrarAsientoDS', borrarAsientoLambda);
    const editarDataSource = api.addLambdaDataSource('EditarAsientoDS', editarAsientoLambda);
    const modelo303DataSource = api.addLambdaDataSource('Modelo303DS', calcularModelo303Lambda);
    const modelo390DataSource = api.addLambdaDataSource('Modelo390DS', calcularModelo390Lambda);
    const modelo347DataSource = api.addLambdaDataSource('Modelo347DS', calcularModelo347Lambda);
    const plantillasDataSource = api.addLambdaDataSource('PlantillasDS', gestionarPlantillasLambda);
    const punteoDataSource = api.addLambdaDataSource('PunteoDS', alternarPunteoLambda);
    const docUploadDataSource = api.addLambdaDataSource('DocUploadDS', generarUrlSubidaLambda);
    const docDownloadDataSource = api.addLambdaDataSource('DocDownloadDS', obtenerUrlDescargaLambda);
    const obtenerAsientoDataSource = api.addLambdaDataSource('ObtenerAsientoDS', obtenerAsientoLambda);
    const n43DataSource = api.addLambdaDataSource('N43DS', procesarFicheroBancoLambda);
    const ocrDataSource = api.addLambdaDataSource('OcrDS', ocrLambda);
    const facturasDataSource = api.addLambdaDataSource('FacturasDS', gestionarFacturasLambda);
    const tesoreriaDataSource = api.addLambdaDataSource('TesoreriaDS', gestionarTesoreriaLambda);
    const activosDataSource = api.addLambdaDataSource('ActivosDS', gestionarActivosLambda);
    const dashboardDataSource = api.addLambdaDataSource('DashboardDS', gestionarDashboardLambda);

    lambdaDataSource.createResolver('CrearAsientoResolver', { typeName: 'Mutation', fieldName: 'crearAsiento' });
    subcuentasDataSource.createResolver('ListarSubcuentasResolver', { typeName: 'Query', fieldName: 'listarSubcuentas' });
    mayorDataSource.createResolver('ObtenerMayorResolver', { typeName: 'Query', fieldName: 'obtenerMayor' });
    balanceDataSource.createResolver('ObtenerBalanceResolver', { typeName: 'Query', fieldName: 'obtenerBalanceSumasSaldos' });
    cierreDataSource.createResolver('CerrarEjercicioResolver', { typeName: 'Mutation', fieldName: 'cerrarEjercicio' });
    empresasDataSource.createResolver('ListarEmpresasResolver', { typeName: 'Query', fieldName: 'listarEmpresas' });
    empresasDataSource.createResolver('CrearEmpresaResolver', { typeName: 'Mutation', fieldName: 'crearEmpresa' });
    empresasDataSource.createResolver('EditarEmpresaResolver', { typeName: 'Mutation', fieldName: 'editarEmpresa' });
    empresasDataSource.createResolver('BorrarEmpresaResolver', { typeName: 'Mutation', fieldName: 'borrarEmpresa' });
    diarioDataSource.createResolver('ObtenerDiarioResolver', { typeName: 'Query', fieldName: 'obtenerDiario' });
    exportarDiarioDataSource.createResolver('ExportarDiarioResolver', { typeName: 'Query', fieldName: 'exportarDiario' });
    borrarDataSource.createResolver('BorrarAsientoResolver', { typeName: 'Mutation', fieldName: 'borrarAsiento' });
    editarDataSource.createResolver('EditarAsientoResolver', { typeName: 'Mutation', fieldName: 'editarAsiento' });
    modelo303DataSource.createResolver('CalcularModelo303Resolver', { typeName: 'Query', fieldName: 'calcularModelo303' });
    modelo390DataSource.createResolver('CalcularModelo390Resolver', { typeName: 'Query', fieldName: 'calcularModelo390' });
    modelo347DataSource.createResolver('CalcularModelo347Resolver', { typeName: 'Query', fieldName: 'calcularModelo347' });
    plantillasDataSource.createResolver('ListarPlantillasResolver', { typeName: 'Query', fieldName: 'listarPlantillas' });
    plantillasDataSource.createResolver('CrearPlantillaResolver', { typeName: 'Mutation', fieldName: 'crearPlantilla' });
    plantillasDataSource.createResolver('BorrarPlantillaResolver', { typeName: 'Mutation', fieldName: 'borrarPlantilla' });
    punteoDataSource.createResolver('AlternarPunteoResolver', { typeName: 'Mutation', fieldName: 'alternarPunteo' });
    docUploadDataSource.createResolver('GenerarUrlSubidaResolver', { typeName: 'Mutation', fieldName: 'generarUrlSubida' });
    docDownloadDataSource.createResolver('ObtenerUrlDescargaResolver', { typeName: 'Query', fieldName: 'obtenerUrlDescarga' });
    obtenerAsientoDataSource.createResolver('ObtenerAsientoResolver', { typeName: 'Query', fieldName: 'obtenerAsiento' });
    n43DataSource.createResolver('ProcesarFicheroBancoResolver', { typeName: 'Mutation', fieldName: 'procesarFicheroBanco' });
    ocrDataSource.createResolver('ExtraerOcrFacturaResolver', { typeName: 'Mutation', fieldName: 'extraerOcrFactura' });
    facturasDataSource.createResolver('CrearFacturaResolver', { typeName: 'Mutation', fieldName: 'crearFactura' });
    facturasDataSource.createResolver('ListarFacturasResolver', { typeName: 'Query', fieldName: 'listarFacturas' });
    tesoreriaDataSource.createResolver('RegistrarPagoFacturaResolver', { typeName: 'Mutation', fieldName: 'registrarPagoFactura' });
    activosDataSource.createResolver('CrearActivoResolver', { typeName: 'Mutation', fieldName: 'crearActivo' });
    activosDataSource.createResolver('ListarActivosResolver', { typeName: 'Query', fieldName: 'listarActivos' });
    dashboardDataSource.createResolver('ObtenerDashboardStatsResolver', { typeName: 'Query', fieldName: 'obtenerDashboardStats' });
    dashboardDataSource.createResolver('ObtenerIngresosMensualesResolver', { typeName: 'Query', fieldName: 'obtenerIngresosMensuales' });

    // Outputs
    new cdk.CfnOutput(this, 'GraphQLAPIURL', { value: api.graphqlUrl });
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'CognitoIssuerURL', { value: `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}` });
  }
}
