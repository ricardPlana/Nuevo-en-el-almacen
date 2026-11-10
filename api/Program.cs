using Azure.Core.Serialization;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Wh3d.Api;
using Wh3d.Api.Auth;
using Wh3d.Api.Data;
using Wh3d.Api.Fno;

// Managed functions de la SWA: solo HTTP. Modelo isolated "clásico" (HttpRequestData), sin integración ASP.NET Core.
var host = new HostBuilder()
    .ConfigureFunctionsWorkerDefaults(worker => worker.UseMiddleware<AuthMiddleware>())
    .ConfigureServices(services =>
    {
        services.Configure<WorkerOptions>(o => o.Serializer = new JsonObjectSerializer(Json.Options));
        services.AddSingleton<EntraTokenValidator>();
        services.AddSingleton<MockWarehouseData>();
        // MOCK_MODE=false → rutas de F&O. Cualquier otro valor (o ninguno) → mock.
        if (string.Equals(Environment.GetEnvironmentVariable("MOCK_MODE"), "false", StringComparison.OrdinalIgnoreCase))
        {
            // 40 s: un Tier-1 de desarrollo recién arrancado tarda >20 s por consulta; las managed functions cortan a los 45 s.
            services.AddSingleton(new HttpClient { Timeout = TimeSpan.FromSeconds(40) });
            services.AddSingleton<FnoClient>();
            services.AddSingleton<IWarehouseData, FnoWarehouseData>();
            services.AddSingleton<IHubData, FnoHubData>();
        }
        else
        {
            services.AddSingleton<IWarehouseData>(sp => sp.GetRequiredService<MockWarehouseData>());
            services.AddSingleton<IHubData, MockHubData>();
        }
    })
    .Build();

host.Run();
