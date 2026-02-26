/**
 * HandySeller Auth Serverless Function
 * Yandex Cloud Functions entrypoint
 */
exports.handler = async (event) => {
  const { httpMethod, body, queryStringParameters } = event;
  const response = {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: "",
  };

  try {
    if (httpMethod === "POST" && event.path?.includes("/auth/login")) {
      const parsed = body ? JSON.parse(body) : {};
      // TODO: validate credentials, query DB, issue JWT
      response.body = JSON.stringify({
        ok: true,
        message: "Auth endpoint ready",
      });
    } else if (httpMethod === "POST" && event.path?.includes("/auth/register")) {
      const parsed = body ? JSON.parse(body) : {};
      // TODO: create user in DB
      response.body = JSON.stringify({
        ok: true,
        message: "Register endpoint ready",
      });
    } else {
      response.statusCode = 404;
      response.body = JSON.stringify({ error: "Not found" });
    }
  } catch (err) {
    response.statusCode = 500;
    response.body = JSON.stringify({ error: err.message });
  }

  return response;
};
