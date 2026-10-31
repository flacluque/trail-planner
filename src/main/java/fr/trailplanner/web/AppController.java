package fr.trailplanner.web;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Ce que le front doit savoir avant tout : code d'invitation à demander, lien pour donner son avis. */
@RestController
@RequestMapping("/api/app")
public class AppController {

    private final AppProperties props;
    private final AccessGuard access;
    private final String supabaseUrl;
    private final String supabaseKey;

    public AppController(AppProperties props, AccessGuard access,
                         @Value("${supabase.url:}") String supabaseUrl,
                         @Value("${supabase.publishable-key:}") String supabaseKey) {
        this.props = props;
        this.access = access;
        this.supabaseUrl = supabaseUrl.isBlank() ? null : supabaseUrl.strip().replaceAll("/+$", "");
        this.supabaseKey = supabaseKey.isBlank() ? null : supabaseKey.strip();
    }

    /**
     * @param feedbackUrl lien du bouton « Donner mon avis », null s'il n'y en a pas
     * @param supabaseUrl projet Supabase des comptes (variable SUPABASE_URL), null sans comptes
     * @param supabaseKey sa clé publique (SUPABASE_PUBLISHABLE_KEY), faite pour être dans l'appli
     */
    public record AppInfo(boolean accessRequired, boolean accessGranted, String feedbackUrl, String supabaseUrl,
                          String supabaseKey) {}

    public record AccessRequest(String code) {}

    @GetMapping
    public AppInfo info(HttpServletRequest request) {
        boolean accounts = supabaseUrl != null && supabaseKey != null;
        return new AppInfo(access.required(), access.granted(request),
                props.feedbackUrl().isEmpty() ? null : props.feedbackUrl(),
                accounts ? supabaseUrl : null, accounts ? supabaseKey : null);
    }

    @PostMapping("/access")
    public ResponseEntity<?> enter(@RequestBody AccessRequest body, HttpServletRequest request, HttpServletResponse response)
            throws InterruptedException {
        if (!access.required() || access.grant(body.code(), request, response)) {
            return ResponseEntity.noContent().build();
        }
        Thread.sleep(500); // freine les essais en série
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, "Ce n'est pas le bon code."));
    }
}
