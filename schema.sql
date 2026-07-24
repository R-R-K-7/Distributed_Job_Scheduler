--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    username character varying(50) NOT NULL,
    email character varying(200) NOT NULL UNIQUE,
    password character varying(255) NOT NULL,
    created timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    role character varying(20) DEFAULT 'user'::character varying,
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['user'::character varying, 'admin'::character varying])::text[])))
);

--
-- Name: jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jobs (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.users(id),
    lang character varying(20) NOT NULL,
    mode integer NOT NULL,
    zippath character varying(200) NOT NULL UNIQUE,
    created timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    timeout integer NOT NULL,
    completed timestamp with time zone,
    status character varying(15) NOT NULL,
    stdout text,
    stderr text,
    name character varying(20),
    description text,
    CONSTRAINT jobs_lang_check CHECK (((lang)::text = ANY ((ARRAY['c'::character varying, 'c++'::character varying, 'python'::character varying])::text[]))),
    CONSTRAINT jobs_mode_check CHECK ((mode = ANY (ARRAY[0, 1]))),
    CONSTRAINT jobs_status_check CHECK (((status)::text = ANY ((ARRAY['QUEUED'::character varying, 'RUNNING'::character varying, 'COMPLETED'::character varying, 'FAILED'::character varying, 'TERMINATED'::character varying, 'KILLED'::character varying, 'SYSTEM_ERROR'::character varying, 'CANCELLING'::character varying])::text[])))
);
