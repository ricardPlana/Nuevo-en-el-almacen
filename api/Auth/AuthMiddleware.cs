using System.Net;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Azure.Functions.Worker.Middleware;
using Microsoft.Extensions.Logging;

namespace Wh3d.Api.Auth;

// SWA pisa la cabecera Authorization en las managed functions, así que usamos cabeceras propias:
//  - X-Wh3d-Token: token de Entra (SPA: Teams SSO o MSAL), scope access_as_user.
//  - x-wh3d-key:   API key del agente de Copilot Studio (AGENT_API_KEY).
// /api/health es público. AUTH_DISABLED=true lo desactiva todo (solo en local).
public sealed class AuthMiddleware(EntraTokenValidator validator, ILogger<AuthMiddleware> log) : IFunctionsWorkerMiddleware
{
    public const string TokenHeader = "X-Wh3d-Token";
    public const string KeyHeader = "x-wh3d-key";

    private static readonly HashSet<string> PublicFunctions = ["Health"];

    public async Task Invoke(FunctionContext context, FunctionExecutionDelegate next)
    {
        if (AuthDisabled() || PublicFunctions.Contains(context.FunctionDefinition.Name))
        {
            await next(context);
            return;
        }

        var req = await context.GetHttpRequestDataAsync();
        if (req is null)
        {
            await next(context);
            return;
        }

        if (ValidKey(Header(req, KeyHeader)))
        {
            await next(context);
            return;
        }

        var token = Header(req, TokenHeader);
        if (token is not null)
        {
            var result = await validator.ValidateAsync(token, context.CancellationToken);
            if (result.IsValid)
            {
                await next(context);
                return;
            }
            log.LogWarning("Token rechazado en {Function}: {Reason}", context.FunctionDefinition.Name, result.Reason);
        }

        var res = req.CreateResponse();
        await res.WriteAsJsonAsync(new { error = "UNAUTHORIZED" });
        res.StatusCode = HttpStatusCode.Unauthorized;
        context.GetInvocationResult().Value = res;
    }

    private static bool AuthDisabled() =>
        string.Equals(Environment.GetEnvironmentVariable("AUTH_DISABLED"), "true", StringComparison.OrdinalIgnoreCase);

    private static string? Header(HttpRequestData req, string name) =>
        req.Headers.TryGetValues(name, out var values) ? values.FirstOrDefault() : null;

    private static bool ValidKey(string? presented)
    {
        var expected = Environment.GetEnvironmentVariable("AGENT_API_KEY");
        if (string.IsNullOrEmpty(expected) || string.IsNullOrEmpty(presented)) return false;
        return CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(presented), Encoding.UTF8.GetBytes(expected));
    }
}
