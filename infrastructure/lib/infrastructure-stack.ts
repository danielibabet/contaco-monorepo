import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as path from 'path';
import * as budgets from 'aws-cdk-lib/aws-budgets';

export class InfrastructureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Añadir Tags globales al stack para organizar la cuenta de AWS
    cdk.Tags.of(this).add('Project', 'ContaCo');
    cdk.Tags.of(this).add('Environment', 'Demo');
    cdk.Tags.of(this).add('ManagedBy', 'CDK');

    // Control de Costes (AWS Budgets)
    new budgets.CfnBudget(this, 'ContaCoBudget', {
      budget: {
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: { amount: 5, unit: 'USD' },
        budgetName: 'ContaCo-Spend-Alerts',
        // Opcional: Filtrar solo por el Tag Project=ContaCo (si Cost Allocation Tags está activado)
        // costFilters: { TagKeyValue: ['user:Project$ContaCo'] }
      },
      notificationsWithSubscribers: [
        {
          notification: { notificationType: 'ACTUAL', comparisonOperator: 'GREATER_THAN', threshold: 100 },
          subscribers: [{ subscriptionType: 'EMAIL', address: 'danielibabet@gmail.com' }],
        },
        {
          notification: { notificationType: 'ACTUAL', comparisonOperator: 'GREATER_THAN', threshold: 200 },
          subscribers: [{ subscriptionType: 'EMAIL', address: 'danielibabet@gmail.com' }],
        },
        {
          notification: { notificationType: 'ACTUAL', comparisonOperator: 'GREATER_THAN', threshold: 300 },
          subscribers: [{ subscriptionType: 'EMAIL', address: 'danielibabet@gmail.com' }],
        },
        {
          notification: { notificationType: 'ACTUAL', comparisonOperator: 'GREATER_THAN', threshold: 400 },
          subscribers: [{ subscriptionType: 'EMAIL', address: 'danielibabet@gmail.com' }],
        }
      ],
    });

    // 1. Autenticación: Amazon Cognito
    const userPool = new cognito.UserPool(this, 'ContaCoUserPool', {
      userPoolName: 'contaco-users',
      passwordPolicy: {
        requireSymbols: false,
        requireUppercase: true,
        requireLowercase: true,
        requireDigits: true,
        minLength: 8,
      },
      selfSignUpEnabled: false, 
      signInAliases: { email: true },
      removalPolicy: cdk.RemovalPolicy.DESTROY, 
    });

    // Añadir Dominio (Requerido por el flujo OAuth de NextAuth)
    const userPoolDomain = userPool.addDomain('ContaCoDomain', {
      cognitoDomain: {
        domainPrefix: `contaco-auth-${this.account}`, // Debe ser único a nivel global
      },
    });

    // App Client para NextAuth con Client Secret
    const userPoolClient = userPool.addClient('ContaCoNextAuthClient', {
      userPoolClientName: 'contaco-nextauth',
      generateSecret: true,
      authFlows: {
        userPassword: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [cognito.OAuthScope.EMAIL, cognito.OAuthScope.OPENID, cognito.OAuthScope.PROFILE],
        callbackUrls: ['http://localhost:3000/api/auth/callback/cognito'],
        logoutUrls: ['http://localhost:3000'],
      },
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
    });

    // 2. Base de Datos: DynamoDB
    const table = new dynamodb.Table(this, 'ContaCoTable', {
      tableName: 'ContaCoTable',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Bucket S3 para Archivo Documental (Fase 19)
    const docsBucket = new s3.Bucket(this, 'ContaCoDocsBucket', {
      bucketName: `contaco-docs-${this.account}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT],
          allowedOrigins: ['*'], // Idealmente en producción limitaríamos al origin de nuestro frontend
          allowedHeaders: ['*'],
        },
      ],
    });

    // 3. Backend: Lambdas
    const crearAsientoLambda = new lambda.Function(this, 'CrearAsientoLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'crearAsiento.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: {
        TABLE_NAME: table.tableName,
      },
    });

    const listarSubcuentasLambda = new lambda.Function(this, 'ListarSubcuentasLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'listarSubcuentas.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: {
        TABLE_NAME: table.tableName,
      },
    });

    const obtenerMayorLambda = new lambda.Function(this, 'ObtenerMayorLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'obtenerMayor.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: {
        TABLE_NAME: table.tableName,
      },
    });

    const obtenerBalanceLambda = new lambda.Function(this, 'ObtenerBalanceLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'obtenerBalanceSumasSaldos.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: {
        TABLE_NAME: table.tableName,
      },
    });

    const cerrarEjercicioLambda = new lambda.Function(this, 'CerrarEjercicioLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'cerrarEjercicio.handler',
      timeout: cdk.Duration.seconds(30), // Puede ser un proceso más pesado
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: {
        TABLE_NAME: table.tableName,
      },
    });

    const migrarContaPlusLambda = new lambda.Function(this, 'MigrarContaPlusLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'migrarContaPlus.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: {
        TABLE_NAME: table.tableName,
        BUCKET_NAME: docsBucket.bucketName
      },
      timeout: cdk.Duration.seconds(120),
      memorySize: 1024
    });

    const listarEmpresasLambda = new lambda.Function(this, 'ListarEmpresasLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'listarEmpresas.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: {
        TABLE_NAME: table.tableName,
      },
    });

    const obtenerDiarioLambda = new lambda.Function(this, 'ObtenerDiarioLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'obtenerDiario.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: {
        TABLE_NAME: table.tableName,
      },
    });

    const borrarAsientoLambda = new lambda.Function(this, 'BorrarAsientoLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'borrarAsiento.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: {
        TABLE_NAME: table.tableName,
      },
    });

    const editarAsientoLambda = new lambda.Function(this, 'EditarAsientoLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'editarAsiento.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: {
        TABLE_NAME: table.tableName,
      },
    });

    const calcularModelo303Lambda = new lambda.Function(this, 'CalcularModelo303Lambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'calcularModelo303.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: {
        TABLE_NAME: table.tableName,
      },
    });

    const calcularModelo390Lambda = new lambda.Function(this, 'CalcularModelo390Lambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'calcularModelo390.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: {
        TABLE_NAME: table.tableName,
      },
    });

    const calcularModelo347Lambda = new lambda.Function(this, 'CalcularModelo347Lambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'calcularModelo347.handler',
      timeout: cdk.Duration.seconds(30), // Puede ser pesado al iterar todas las subcuentas
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: {
        TABLE_NAME: table.tableName,
      },
    });

    const gestionarPlantillasLambda = new lambda.Function(this, 'GestionarPlantillasLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'gestionarPlantillas.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: {
        TABLE_NAME: table.tableName,
      },
    });

    const alternarPunteoLambda = new lambda.Function(this, 'AlternarPunteoLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'alternarPunteo.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: {
        TABLE_NAME: table.tableName,
      },
    });

    const generarUrlSubidaLambda = new lambda.Function(this, 'GenerarUrlSubidaLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'generarUrlSubida.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: {
        TABLE_NAME: table.tableName,
        BUCKET_NAME: docsBucket.bucketName,
      },
    });

    const obtenerUrlDescargaLambda = new lambda.Function(this, 'ObtenerUrlDescargaLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'obtenerUrlDescarga.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: {
        BUCKET_NAME: docsBucket.bucketName,
      },
    });

    const obtenerAsientoLambda = new lambda.Function(this, 'ObtenerAsientoLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'obtenerAsiento.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      environment: {
        TABLE_NAME: table.tableName,
      },
    });

    const procesarFicheroBancoLambda = new lambda.Function(this, 'ProcesarFicheroBancoLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'procesarFicheroBanco.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
    });

    // Permisos
    table.grantWriteData(crearAsientoLambda);
    table.grantReadData(listarSubcuentasLambda);
    table.grantReadData(obtenerMayorLambda);
    table.grantReadData(obtenerBalanceLambda);
    table.grantReadWriteData(cerrarEjercicioLambda);
    table.grantReadWriteData(migrarContaPlusLambda);
    docsBucket.grantRead(migrarContaPlusLambda);
    table.grantReadData(listarEmpresasLambda);
    table.grantReadData(obtenerDiarioLambda);
    table.grantReadData(obtenerAsientoLambda);
    table.grantReadWriteData(borrarAsientoLambda);
    table.grantReadWriteData(editarAsientoLambda);
    table.grantReadData(calcularModelo303Lambda);
    table.grantReadData(calcularModelo390Lambda);
    table.grantReadData(calcularModelo347Lambda);
    table.grantReadWriteData(gestionarPlantillasLambda);
    table.grantReadWriteData(alternarPunteoLambda);
    table.grantReadWriteData(generarUrlSubidaLambda);

    docsBucket.grantPut(generarUrlSubidaLambda);
    docsBucket.grantRead(obtenerUrlDescargaLambda);

    // 4. API GraphQL: AWS AppSync
    const api = new appsync.GraphqlApi(this, 'ContaCoApi', {
      name: 'contaco-api',
      schema: appsync.SchemaFile.fromAsset(path.join(__dirname, '../graphql/schema.graphql')),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.USER_POOL,
          userPoolConfig: {
            userPool: userPool,
          },
        },
      },
    });

    // Conectar AppSync con la Lambda
    const lambdaDataSource = api.addLambdaDataSource('LambdaDS', crearAsientoLambda);
    const subcuentasDataSource = api.addLambdaDataSource('SubcuentasDS', listarSubcuentasLambda);
    const mayorDataSource = api.addLambdaDataSource('MayorDS', obtenerMayorLambda);
    const balanceDataSource = api.addLambdaDataSource('BalanceDS', obtenerBalanceLambda);
    const cierreDataSource = api.addLambdaDataSource('CierreDS', cerrarEjercicioLambda);
    const empresasDataSource = api.addLambdaDataSource('EmpresasDS', listarEmpresasLambda);
    const diarioDataSource = api.addLambdaDataSource('DiarioDS', obtenerDiarioLambda);
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
    const migrarContaPlusDataSource = api.addLambdaDataSource('MigrarContaPlusDS', migrarContaPlusLambda);

    // Configurar el Resolver para la mutación crearAsiento
    lambdaDataSource.createResolver('CrearAsientoResolver', {
      typeName: 'Mutation',
      fieldName: 'crearAsiento',
    });

    // Configurar el Resolver para la query listarSubcuentas
    subcuentasDataSource.createResolver('ListarSubcuentasResolver', {
      typeName: 'Query',
      fieldName: 'listarSubcuentas',
    });

    // Configurar el Resolver para la query obtenerMayor
    mayorDataSource.createResolver('ObtenerMayorResolver', {
      typeName: 'Query',
      fieldName: 'obtenerMayor',
    });

    // Configurar el Resolver para la query obtenerBalanceSumasSaldos
    balanceDataSource.createResolver('ObtenerBalanceResolver', {
      typeName: 'Query',
      fieldName: 'obtenerBalanceSumasSaldos',
    });

    // Configurar el Resolver para la mutación cerrarEjercicio
    cierreDataSource.createResolver('CerrarEjercicioResolver', {
      typeName: 'Mutation',
      fieldName: 'cerrarEjercicio',
    });

    // Configurar el Resolver para la query listarEmpresas
    empresasDataSource.createResolver('ListarEmpresasResolver', {
      typeName: 'Query',
      fieldName: 'listarEmpresas',
    });

    diarioDataSource.createResolver('ObtenerDiarioResolver', {
      typeName: 'Query',
      fieldName: 'obtenerDiario',
    });

    borrarDataSource.createResolver('BorrarAsientoResolver', {
      typeName: 'Mutation',
      fieldName: 'borrarAsiento',
    });

    editarDataSource.createResolver('EditarAsientoResolver', {
      typeName: 'Mutation',
      fieldName: 'editarAsiento',
    });

    modelo303DataSource.createResolver('CalcularModelo303Resolver', {
      typeName: 'Query',
      fieldName: 'calcularModelo303',
    });

    modelo390DataSource.createResolver('CalcularModelo390Resolver', {
      typeName: 'Query',
      fieldName: 'calcularModelo390',
    });

    modelo347DataSource.createResolver('CalcularModelo347Resolver', {
      typeName: 'Query',
      fieldName: 'calcularModelo347',
    });

    plantillasDataSource.createResolver('ListarPlantillasResolver', {
      typeName: 'Query',
      fieldName: 'listarPlantillas',
    });

    plantillasDataSource.createResolver('CrearPlantillaResolver', {
      typeName: 'Mutation',
      fieldName: 'crearPlantilla',
    });

    plantillasDataSource.createResolver('BorrarPlantillaResolver', {
      typeName: 'Mutation',
      fieldName: 'borrarPlantilla',
    });

    punteoDataSource.createResolver('AlternarPunteoResolver', {
      typeName: 'Mutation',
      fieldName: 'alternarPunteo',
    });

    docUploadDataSource.createResolver('GenerarUrlSubidaResolver', {
      typeName: 'Mutation',
      fieldName: 'generarUrlSubida',
    });

    docDownloadDataSource.createResolver('ObtenerUrlDescargaResolver', {
      typeName: 'Query',
      fieldName: 'obtenerUrlDescarga',
    });

    obtenerAsientoDataSource.createResolver('ObtenerAsientoResolver', {
      typeName: 'Query',
      fieldName: 'obtenerAsiento',
    });

    n43DataSource.createResolver('ProcesarFicheroBancoResolver', {
      typeName: 'Mutation',
      fieldName: 'procesarFicheroBanco',
    });

    migrarContaPlusDataSource.createResolver('MigrarContaPlusResolver', {
      typeName: 'Mutation',
      fieldName: 'migrarContaPlus',
    });

    // Outputs
    new cdk.CfnOutput(this, 'GraphQLAPIURL', { value: api.graphqlUrl });
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'CognitoIssuerURL', { value: `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}` });
  }
}
