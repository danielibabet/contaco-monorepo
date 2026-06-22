import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';

export class InfrastructureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Añadir Tag global al stack
    cdk.Tags.of(this).add('Project', 'contaco');

    // 1. Autenticación: Amazon Cognito
    const userPool = new cognito.UserPool(this, 'ContaCoUserPool', {
      userPoolName: 'contaco-users',
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

    // Permisos
    table.grantWriteData(crearAsientoLambda);
    table.grantReadData(listarSubcuentasLambda);
    table.grantReadData(obtenerMayorLambda);
    table.grantReadData(obtenerBalanceLambda);
    table.grantReadWriteData(cerrarEjercicioLambda);
    table.grantReadData(listarEmpresasLambda);
    table.grantReadData(obtenerDiarioLambda);
    table.grantReadWriteData(borrarAsientoLambda);
    table.grantReadWriteData(editarAsientoLambda);
    table.grantReadData(calcularModelo303Lambda);

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

    // Outputs
    new cdk.CfnOutput(this, 'GraphQLAPIURL', { value: api.graphqlUrl });
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'CognitoIssuerURL', { value: `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}` });
  }
}
