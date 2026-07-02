import { CognitoIdentityProviderClient, SignUpCommand } from "@aws-sdk/client-cognito-identity-provider";
import crypto from "crypto";

const clientId = "3va12c30fjo63legva077mc52r";
const clientSecret = "16ejbc48str95jdt13098ubu4hndeflvs0q6o8f9r3h3peqhdsfk";
const region = "eu-west-1";
const email = "danizgz95@gmail.com";
const password = "Password123!";

async function run() {
  try {
    const secretHash = crypto
      .createHmac('SHA256', clientSecret)
      .update(email + clientId)
      .digest('base64');

    const client = new CognitoIdentityProviderClient({ region });
    
    const command = new SignUpCommand({
      ClientId: clientId,
      Username: email,
      Password: password,
      SecretHash: secretHash,
      UserAttributes: [
        { Name: "email", Value: email }
      ]
    });

    const response = await client.send(command);
    console.log("Success:", response);
  } catch (error) {
    console.error("Error name:", error.name);
    console.error("Error message:", error.message);
  }
}

run();
