using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace Wh3d.Api.Auth;

// Valida tokens de Entra de wh3d-app: firma (claves del tenant), emisor v1 o v2,
// audiencia = Application ID URI o clientId, y scope access_as_user.
public sealed class EntraTokenValidator
{
    private const string RequiredScope = "access_as_user";

    private readonly string tenantId = Environment.GetEnvironmentVariable("ENTRA_TENANT_ID") ?? "";
    private readonly string audience = Environment.GetEnvironmentVariable("ENTRA_API_AUDIENCE") ?? "";
    private readonly JsonWebTokenHandler handler = new();
    private readonly ConfigurationManager<OpenIdConnectConfiguration>? config;

    public EntraTokenValidator()
    {
        if (tenantId.Length > 0)
        {
            config = new ConfigurationManager<OpenIdConnectConfiguration>(
                $"https://login.microsoftonline.com/{tenantId}/v2.0/.well-known/openid-configuration",
                new OpenIdConnectConfigurationRetriever(),
                new HttpDocumentRetriever());
        }
    }

    public async Task<(bool IsValid, string? Reason)> ValidateAsync(string token, CancellationToken ct)
    {
        if (config is null || audience.Length == 0) return (false, "ENTRA_TENANT_ID / ENTRA_API_AUDIENCE sin configurar");

        OpenIdConnectConfiguration oidc;
        try
        {
            oidc = await config.GetConfigurationAsync(ct);
        }
        catch (Exception e)
        {
            return (false, $"no puedo leer las claves del tenant: {e.Message}");
        }
        // api://<swa-host>/<clientId> → el clientId es el último segmento (tokens v2 traen aud = clientId).
        var clientId = audience.TrimEnd('/').Split('/').Last();
        var parameters = new TokenValidationParameters
        {
            ValidIssuers = [$"https://sts.windows.net/{tenantId}/", $"https://login.microsoftonline.com/{tenantId}/v2.0"],
            ValidAudiences = [audience, clientId],
            IssuerSigningKeys = oidc.SigningKeys,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(2),
        };

        var result = await handler.ValidateTokenAsync(token, parameters);
        if (!result.IsValid) return (false, result.Exception?.Message ?? "token no válido");

        var scopes = (result.Claims.TryGetValue("scp", out var scp) ? scp as string : null) ?? "";
        return scopes.Split(' ').Contains(RequiredScope) ? (true, null) : (false, $"falta el scope {RequiredScope}");
    }
}
