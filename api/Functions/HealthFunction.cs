using System.Net;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;

namespace Wh3d.Api.Functions;

public sealed class HealthFunction
{
    // GET /api/health — sin auth; lo usa el checklist del día de la demo.
    [Function("Health")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "health")] HttpRequestData req)
    {
        var mockMode = !string.Equals(Environment.GetEnvironmentVariable("MOCK_MODE"), "false", StringComparison.OrdinalIgnoreCase);
        var version = typeof(HealthFunction).Assembly.GetName().Version?.ToString(3) ?? "0.0.0";

        var res = req.CreateResponse(HttpStatusCode.OK);
        await res.WriteAsJsonAsync(new { status = "ok", mockMode, version });
        return res;
    }
}
